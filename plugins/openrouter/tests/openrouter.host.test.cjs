const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { hostRequire, load } = require("../../../tests/support/host.cjs");
const { zipSync } = hostRequire("fflate");
const runScript = require("../../../tests/support/script-runner.cjs");
const { readProviderPackage } = load("providers/package.js");
const { createServiceInstance, projectInstanceConfig } = load(
  "providers/instances.js",
);
const { runDeclarative } = load("providers/declarative.js");
const { providerHelpers } = load("providers/sdk/index.js");
const { supportsProviderCapability } = load("providers/capabilities.js");
const { validateResult } = load("providers/validation.js");
const { supportsApiCapability, isApiConfigured } = load(
  "config/serviceSelection.js",
);
const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
);
const files = Object.fromEntries(
  [
    "manifest.json",
    ...new Set(manifest.services.map((s) => s.implementation.entry)),
  ].map((file) => [file, fs.readFileSync(path.join(root, file))]),
);
const pack = readProviderPackage(zipSync(files));

function fixture(id = "chat-completions", model) {
  const api = createServiceInstance(
    pack.manifest,
    id,
    pack.implementations[id],
    { apiKey: "test-secret", ...(model && { model }) },
    `test-${id}`,
  );
  const calls = [];
  const events = [];
  const ctx = {
    config: projectInstanceConfig(api).config,
    helpers: providerHelpers,
    secrets: { ref: (key) => ({ key }) },
    options: { streaming: false },
    assets: { read: async () => Uint8Array.from([0, 1, 127, 128, 255]).buffer },
    emit: async (event) => events.push(event),
    http: {
      request: async (request) => {
        calls.push(request);
        return { status: 200, body: JSON.stringify({ text: "你好" }) };
      },
    },
  };
  const invoke = (handler, input) =>
    api.provider.code
      ? runScript(api.provider, handler, input, ctx)
      : runDeclarative(api.provider, handler, input, ctx);
  return { api, ctx, invoke, calls, events };
}
const chat = { messages: [{ role: "user", content: "Hello" }] };
const batch = {
  items: [
    { id: "a", text: "Hello" },
    { id: "b", text: "World" },
  ],
  targetLanguage: "zh",
};
const audio = { audio: { assetId: "audio-1", mimeType: "audio/wav" } };
function response(f, text) {
  f.ctx.http.request = async (request) => {
    f.calls.push(request);
    return {
      status: 200,
      body: JSON.stringify({
        choices: [{ message: { content: text }, finish_reason: "stop" }],
      }),
    };
  };
}
function stream(f, text, terminal = true) {
  f.ctx.options.streaming = true;
  f.ctx.http.stream = async function* (request) {
    f.calls.push(request);
    for (const content of [text.slice(0, 8), text.slice(8)])
      yield {
        type: "sse",
        data: JSON.stringify({ choices: [{ delta: { content } }] }),
      };
    if (terminal) {
      yield {
        type: "sse",
        data: JSON.stringify({
          choices: [{ delta: {}, finish_reason: "stop" }],
        }),
      };
      yield { type: "sse", data: "[DONE]" };
    }
  };
}

test("ZIP parses with the production loader; two service definitions expose the intended capabilities", () => {
  assert.equal(pack.manifest.id, "openrouter");
  assert.equal(pack.manifest.version, "1.1.0");
  assert.equal(pack.manifest.services.length, 2);
  for (const id of [
    "chat-completions",
    "transcriptions",
  ]) {
    const { api, ctx } = fixture(id);
    assert.equal(ctx.config.baseUrl, "https://openrouter.ai/api/v1");
    assert.equal(api.provider.source.pluginId, "openrouter");
    assert.equal(isApiConfigured(api), true);
    assert.equal(supportsApiCapability(api, "chat"), id === "chat-completions");
    assert.equal(
      supportsApiCapability(api, "transcribe"),
      id !== "chat-completions",
    );
    assert.equal(
      supportsProviderCapability(api, "transcribe"),
      id !== "chat-completions",
    );
    assert.equal(
      supportsProviderCapability(api, "translate"),
      id === "chat-completions",
    );
    if (id !== "chat-completions") {
      assert.deepEqual(api.provider.capabilities.transcribe.outputModes, [
        "complete",
      ]);
      assert.ok(!api.provider.capabilities.transcribe.timestamps);
    }
  }
});
test("chat uses OpenRouter endpoint, model and secret reference", async () => {
  const f = fixture();
  response(f, "Hello");
  assert.equal((await f.invoke("chat", chat)).text, "Hello");
  assert.equal(f.calls[0].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(f.calls[0].body.model, "openai/gpt-6-luna");
  assert.deepEqual(f.calls[0].auth, {
    type: "bearer",
    secret: { key: "apiKey" },
  });
  assert.ok(!JSON.stringify(f.calls).includes("test-secret"));
});
test("single translation and reordered batch translation use SDK contracts", async () => {
  const f = fixture();
  response(f, "你好");
  const single = {
    items: [batch.items[0]],
    translationMode: "single",
    outputProtocol: "text",
    targetLanguage: "zh",
  };
  assert.deepEqual(await f.invoke("translate", single), {
    items: [{ id: "a", text: "你好" }],
  });
  response(f, '[{"id":"b","text":"世界"},{"id":"a","text":"你好"}]');
  assert.deepEqual(await f.invoke("translate", batch), {
    items: [
      { id: "a", text: "你好" },
      { id: "b", text: "世界" },
    ],
  });
  response(f, '[{"id":"a","text":"你好"}]');
  await assert.rejects(f.invoke("translate", batch), {
    code: "INCOMPLETE_RESPONSE",
  });
});
for (const handler of ["chat", "translate"]) {
  test(`${handler} streams through SDK parsers and rejects truncation`, async () => {
    const f = fixture();
    const text =
      handler === "chat"
        ? "Hello"
        : '[{"id":"b","text":"世界"},{"id":"a","text":"你好"}]';
    const input = handler === "chat" ? chat : batch;
    stream(f, text);
    const result = await f.invoke(handler, input);
    assert.ok(f.events.length > 0);
    assert.equal(f.calls[0].body.stream, true);
    if (handler === "chat") assert.equal(result.text, "Hello");
    else
      assert.deepEqual(result, {
        items: [
          { id: "a", text: "你好" },
          { id: "b", text: "世界" },
        ],
      });
    stream(f, text, false);
    await assert.rejects(f.invoke(handler, input), {
      code: "INCOMPLETE_RESPONSE",
    });
  });
}
for (const model of ["openai/whisper-large-v3-turbo", "qwen/qwen3-asr-0.6b"]) {
  test(`${model} sends binary audio as raw base64 JSON and maps text`, async () => {
    const f = fixture("transcriptions", model);
    const result = await f.invoke("transcribe", {
      ...audio,
      language: "zh-CN",
    });
    assert.deepEqual(result, { text: "你好" });
    validateResult(
      "transcribe",
      result,
      audio,
      f.api.provider.capabilities.transcribe,
    );
    assert.equal(
      f.calls[0].url,
      "https://openrouter.ai/api/v1/audio/transcriptions",
    );
    assert.deepEqual(f.calls[0].auth, {
      type: "bearer",
      secret: { key: "apiKey" },
    });
    assert.equal(f.calls[0].bodyType, "json");
    assert.deepEqual(f.calls[0].body, {
      model,
      input_audio: { data: "AAF/gP8=", format: "wav" },
      response_format: "json",
      language: "zh",
    });
    for (const language of [undefined, "", "auto"]) {
      await f.invoke("transcribe", { ...audio, language });
      assert.ok(!Object.hasOwn(f.calls.at(-1).body, "language"));
    }
  });
}
test("transcription maps supported audio MIME types, including codec parameters", async () => {
  const f = fixture("transcriptions");
  for (const [mimeType, format] of [
    ["audio/webm;codecs=opus", "webm"],
    ["audio/mpeg", "mp3"],
    ["audio/mp4", "m4a"],
    ["audio/ogg", "ogg"],
    ["audio/flac", "flac"],
    ["audio/aac", "aac"],
  ]) {
    await f.invoke("transcribe", { audio: { ...audio.audio, mimeType } });
    assert.equal(f.calls.at(-1).body.input_audio.format, format);
  }
  await assert.rejects(
    f.invoke("transcribe", {
      audio: { ...audio.audio, mimeType: "application/octet-stream" },
    }),
    /Unsupported/,
  );
  assert.equal(f.calls.length, 6);
});
test("service errors and malformed responses propagate", async () => {
  for (const id of [
    "chat-completions",
    "transcriptions",
  ]) {
    const f = fixture(id);
    const handler = id === "chat-completions" ? "chat" : "transcribe";
    const input = handler === "chat" ? chat : audio;
    f.ctx.http.request = async () => ({
      status: 429,
      body: '{"error":{"message":"rate limited"}}',
    });
    await assert.rejects(f.invoke(handler, input), { code: "HTTP_ERROR" });
    f.ctx.http.request = async () => ({
      status: 200,
      body: '{"error":{"message":"provider unavailable"}}',
    });
    await assert.rejects(f.invoke(handler, input), { code: "PROVIDER_ERROR" });
    f.ctx.http.request = async () => ({ status: 200, body: "{}" });
    await assert.rejects(f.invoke(handler, input));
  }
});
test("streamed provider errors propagate for both chat and translation", async () => {
  for (const handler of ["chat", "translate"]) {
    const f = fixture();
    f.ctx.options.streaming = true;
    f.ctx.http.stream = async function* () {
      yield { type: "sse", data: '{"error":{"message":"provider failed"}}' };
    };
    await assert.rejects(f.invoke(handler, handler === "chat" ? chat : batch), {
      code: "PROVIDER_ERROR",
    });
  }
});
test("packaging is deterministic, produces an installable ZIP and matching official catalog", () => {
  const { execFileSync } = require("node:child_process");
  const { createHash } = require("node:crypto");
  const build = path.resolve(root, "../../scripts/build.cjs");
  execFileSync(process.execPath, [build]);
  const dist = path.resolve(root, "../../dist");
  const file = path.join(dist, "openrouter/1.1.0.zip");
  const bytes = fs.readFileSync(file);
  execFileSync(process.execPath, [build]);
  assert.deepEqual(fs.readFileSync(file), bytes);
  const installed = readProviderPackage(new Uint8Array(bytes));
  assert.equal(installed.manifest.id, "openrouter");
  assert.equal(installed.manifest.services.length, 2);
  const { unzipSync } = hostRequire("fflate");
  assert.deepEqual(Object.keys(unzipSync(bytes)).sort(), [
    "manifest.json",
    "services/chat.json",
    "services/transcribe.js",
  ]);
  const catalog = JSON.parse(
    fs.readFileSync(path.join(dist, "catalog.json"), "utf8"),
  );
  const entries = catalog.plugins.filter((item) => item.id === "openrouter");
  assert.equal(entries.length, 1);
  assert.equal(
    entries[0].sha256,
    createHash("sha256").update(bytes).digest("hex"),
  );
  assert.equal(entries[0].version, installed.manifest.version);
});

test("one transcription definition provides both models and isolated custom-model instances", () => {
  const service = pack.manifest.services.find(item => item.id === "transcriptions");
  const expected = ["openai/whisper-large-v3-turbo", "qwen/qwen3-asr-0.6b"];
  assert.deepEqual(service.models.map(item => item.id), expected);
  const first = fixture("transcriptions");
  const second = fixture("transcriptions", expected[1]);
  const custom = fixture("transcriptions", "custom/asr");
  assert.equal(first.ctx.config.model, expected[0]);
  assert.equal(second.ctx.config.model, expected[1]);
  assert.equal(custom.ctx.config.model, "custom/asr");
  second.ctx.config.model = "changed";
  assert.equal(first.ctx.config.model, expected[0]);
  assert.ok(!first.api.provider.capabilities.transcribe.timestamps);
});
