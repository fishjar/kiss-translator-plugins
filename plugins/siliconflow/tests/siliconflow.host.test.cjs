const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
// Reuse the existing test-only host compiler, without modifying another plugin.
const { load } = require("../../../tests/support/host.cjs");
const { buildPackage } = require("../../../scripts/build.cjs");
const { readProviderPackage } = load("providers/package.js");
const { createServiceInstance, projectInstanceConfig } = load(
  "providers/instances.js",
);
const { createProviderRegistry } = load("providers/registry.js");
const { createAssetStore, createTransportBroker } = load(
  "providers/transport.js",
);
const { runDeclarative } = load("providers/declarative.js");
const { providerHelpers } = load("providers/sdk/index.js");
const { createTranslationHelpers } = load("providers/sdk/translation.js");
const { supportsApiCapability } = load("config/serviceSelection.js");
const manifest = require("../manifest.json");
const pack = readProviderPackage(
  new Uint8Array(buildPackage(path.resolve(__dirname, "..")).bytes),
);
const models = {
  "chat-completions": "deepseek-ai/DeepSeek-V4.1-Flash",
  transcriptions: "Qwen/Qwen3-ASR-1.7B",
  "xingchen-transcriptions": "XingChenAGI/XingChenASR-V3.2-Ultra",
  paddleocr: "PaddlePaddle/PaddleOCR-VL-1.5",
  "deepseek-ocr": "deepseek-ai/DeepSeek-OCR",
};
const completion = (text) => ({
  choices: [{ message: { content: text }, finish_reason: "stop" }],
});

const asrModels = ["Qwen/Qwen3-ASR-1.7B", "XingChenAGI/XingChenASR-V3.2-Ultra"];

function fixture(id = "chat-completions", model) {
  const instance = createServiceInstance(
    pack.manifest,
    id,
    pack.implementations[id],
    { apiKey: "test-only-secret", ...(model && { model }) },
    "test-" + id,
  );
  const assets = createAssetStore(),
    calls = [],
    events = [];
  let respond = () => Response.json(completion("Hello"));
  const registry = createProviderRegistry({
    resolveInstance: () => instance,
    createContext: (api, invocation) => ({
      ...invocation,
      ...createTransportBroker(api, {
        signal: invocation.signal,
        assets,
        fetchImpl: async (url, init) => {
          calls.push({ url, init });
          return respond(url, init);
        },
      }),
      assets,
      config: projectInstanceConfig(api).config,
      helpers: {
        ...providerHelpers,
        translation: {
          ...providerHelpers.translation,
          ...createTranslationHelpers(invocation.translationInput),
        },
      },
    }),
    runners: {
      declarative: runDeclarative,
      script: require("../../../tests/support/script-runner.cjs"),
    },
  });
  return {
    instance,
    assets,
    calls,
    events,
    respond: (value) => {
      respond = value;
    },
    async invoke(capability, input, options = {}) {
      const call = registry.invoke(instance.apiSlug, capability, input, {
        streaming: "disabled",
        ...options,
      });
      const consumed = (async () => {
        try {
          for await (const event of call.events) events.push(event);
        } catch {
          /* result carries the execution error */
        }
      })();
      try {
        return await call.result;
      } finally {
        await call.finished;
        await consumed;
      }
    },
  };
}
const chat = { messages: [{ role: "user", content: "Hello" }] };
const batch = {
  items: [
    { id: "a", text: "Hello" },
    { id: "b", text: "World" },
  ],
  targetLanguage: "zh",
  translationMode: "batch",
  outputProtocol: "json",
};
const image = (f, type = "image/png") => ({
  image: f.assets.put(new Blob([Uint8Array.of(137, 80, 78, 71)], { type })),
  mode: "doc",
});
const audio = (f) => ({
  audio: f.assets.put(
    new Blob([Uint8Array.of(1, 2, 3)], { type: "audio/wav" }),
  ),
});

test("production package parser and service definitions preserve model, config and capability boundaries", () => {
  assert.equal(pack.manifest.id, "siliconflow");
  assert.equal(pack.manifest.version, manifest.version);
  assert.deepEqual(
    pack.manifest.services.map((service) => service.id),
    Object.keys(models),
  );
  for (const [id, model] of Object.entries(models)) {
    const { instance } = fixture(id);
    assert.equal(instance.pluginConfig.model, model);
    assert.equal(
      instance.pluginConfig.baseUrl,
      "https://api.siliconflow.cn/v1",
    );
    assert.equal(
      supportsApiCapability(instance, "chat"),
      id === "chat-completions",
    );
    assert.equal(
      supportsApiCapability(instance, "translate"),
      id === "chat-completions",
    );
    assert.equal(
      supportsApiCapability(instance, "transcribe"),
      id.endsWith("transcriptions"),
    );
    assert.equal(
      supportsApiCapability(instance, "parseImage"),
      ["paddleocr", "deepseek-ocr"].includes(id),
    );
    assert.equal(
      instance.provider.capabilities.transcribe?.timestamps === true,
      id === "xingchen-transcriptions",
    );
    assert.ok(!instance.provider.capabilities.parseImage?.coordinates);
    assert.equal(projectInstanceConfig(instance).config.apiKey, undefined);
    assert.equal(
      createServiceInstance(
        pack.manifest,
        id,
        pack.implementations[id],
        { model: "custom/model" },
        "custom",
      ).pluginConfig.model,
      "custom/model",
    );
  }
});

test("chat uses bearer auth at the transport boundary and supplier-default reasoning", async () => {
  const f = fixture();
  assert.equal((await f.invoke("chat", chat)).text, "Hello");
  const { url, init } = f.calls[0],
    body = JSON.parse(init.body);
  assert.equal(url, "https://api.siliconflow.cn/v1/chat/completions");
  assert.equal(init.headers.Authorization, "Bearer test-only-secret");
  assert.equal(init.credentials, "omit");
  assert.equal(init.redirect, "error");
  assert.equal(body.model, models["chat-completions"]);
  for (const key of [
    "thinking",
    "reasoning_effort",
    "enable_thinking",
    "thinking_budget",
  ])
    assert.ok(!Object.hasOwn(body, key));
});

test("single and batch translation preserve IDs, prompts and reject missing results", async () => {
  const f = fixture();
  f.respond(() => Response.json(completion("你好")));
  assert.deepEqual(
    await f.invoke("translate", {
      ...batch,
      items: [batch.items[0]],
      translationMode: "single",
      outputProtocol: "text",
    }),
    { items: [{ id: "a", text: "你好" }] },
  );
  assert.match(
    JSON.parse(f.calls[0].init.body).messages[0].content,
    /without explanations/,
  );
  f.respond(() =>
    Response.json(
      completion('[{"id":"b","text":"世界"},{"id":"a","text":"你好"}]'),
    ),
  );
  assert.deepEqual(await f.invoke("translate", batch), {
    items: [
      { id: "a", text: "你好" },
      { id: "b", text: "世界" },
    ],
  });
  f.respond(() => Response.json(completion('[{"id":"a","text":"你好"}]')));
  await assert.rejects(f.invoke("translate", batch), {
    code: "INCOMPLETE_RESPONSE",
  });
});

for (const capability of ["chat", "translate"]) {
  test(`${capability} streams through production SSE and rejects truncated completion`, async () => {
    const f = fixture();
    const text =
      capability === "chat"
        ? "Hello"
        : '[{"id":"a","text":"你好"},{"id":"b","text":"世界"}]';
    const frames = [
      JSON.stringify({ choices: [{ delta: { content: text } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
      "[DONE]",
    ];
    const respond = (terminal) =>
      new Response(
        frames
          .slice(0, terminal ? 3 : 1)
          .map((data) => `data: ${data}\n\n`)
          .join(""),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    f.respond(() => respond(true));
    const result = await f.invoke(
      capability,
      capability === "chat" ? chat : batch,
      { streaming: "required" },
    );
    assert.ok(f.events.length > 0);
    assert.equal(JSON.parse(f.calls[0].init.body).stream, true);
    if (capability === "chat") assert.equal(result.text, "Hello");
    else assert.equal(result.items.length, 2);
    f.respond(() => respond(false));
    await assert.rejects(
      f.invoke(capability, capability === "chat" ? chat : batch, {
        streaming: "required",
      }),
      { code: "INCOMPLETE_RESPONSE" },
    );
  });
}

for (const model of asrModels)
  test(`${model} uploads real multipart file bytes and requests its supported timing`, async () => {
    const timestamped = model === asrModels[1];
    const f = fixture(timestamped ? "xingchen-transcriptions" : "transcriptions", model),
      input = audio(f);
    const response = timestamped
      ? { text: "你好", segments: [{ start: 0, end: 1, text: "你好" }] }
      : { text: "你好" };
    f.respond(() => Response.json(response));
    assert.deepEqual(
      await f.invoke("transcribe", { ...input, language: "zh-CN" }),
      response,
    );
    const { url, init } = f.calls[0];
    assert.equal(url, "https://api.siliconflow.cn/v1/audio/transcriptions");
    assert.ok(init.body instanceof FormData);
    assert.deepEqual([...init.body.keys()], timestamped
      ? ["file", "model", "response_format"]
      : ["file", "model"]);
    if (timestamped) {
      assert.equal(init.body.get("response_format"), "verbose_json");
      assert.equal(init.body.has("timestamp_granularities[]"), false);
    }
    assert.equal(init.body.get("model"), model);
    assert.equal(init.body.get("file").type, "audio/wav");
    assert.equal(init.body.get("file").name, "audio.wav");
    assert.deepEqual(
      [...new Uint8Array(await init.body.get("file").arrayBuffer())],
      [1, 2, 3],
    );
    assert.ok(
      !Object.keys(init.headers).some(
        (key) => key.toLowerCase() === "content-type",
      ),
    );
  });

for (const id of ["paddleocr", "deepseek-ocr"]) {
  test(`${id} preserves Markdown, sends image data URL and accepts custom instructions`, async () => {
    const f = fixture(id),
      input = image(f),
      text = "# 标题\n\n| A | B |\n| --- | --- |\n| 甲 | 乙 |";
    f.respond(() => Response.json(completion(text)));
    const result = await f.invoke("parseImage", input);
    assert.equal(result.text, text);
    assert.equal(result.format, "text");
    assert.ok(result.items.every((item) => item.poly === null));
    const body = JSON.parse(f.calls[0].init.body);
    assert.equal(body.model, models[id]);
    assert.equal(body.stream, false);
    assert.equal(body.temperature, 0);
    assert.equal(
      f.instance.provider.defaultPrompts.vlm.userPrompt,
      id === "paddleocr" ? "OCR:" : "Free OCR.",
    );
    assert.equal(
      body.messages[0].content[id === "deepseek-ocr" ? 1 : 0].text,
      f.instance.provider.defaultPrompts.vlm.userPrompt,
    );
    assert.equal(
      body.messages[0].content[id === "deepseek-ocr" ? 0 : 1].image_url.url,
      "data:image/png;base64,iVBORw==",
    );
    await f.invoke("parseImage", {
      ...input,
      prompt: "Only transcribe numbers",
    });
    assert.equal(
      JSON.parse(f.calls[1].init.body).messages[0].content[
        id === "deepseek-ocr" ? 1 : 0
      ].text,
      "Only transcribe numbers",
    );
  });
  test(`${id} rejects invalid assets, unsupported task modes, excessive size and streaming`, async () => {
    const f = fixture(id);
    await assert.rejects(
      f.invoke("parseImage", {
        image: { assetId: "asset-999", mimeType: "image/png" },
      }),
      { code: "ASSET_UNAVAILABLE" },
    );
    await assert.rejects(f.invoke("parseImage", image(f, "application/pdf")), {
      code: "INVALID_ASSET",
    });
    const input = image(f);
    await assert.rejects(f.invoke("parseImage", { ...input, mode: "table" }), {
      code: "TASK_UNSUPPORTED",
    });
    await assert.rejects(
      f.invoke("parseImage", input, { streaming: "required" }),
      { code: "STREAM_UNSUPPORTED" },
    );
    const huge = f.assets.put(
      new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: "image/png" }),
    );
    await assert.rejects(f.invoke("parseImage", { image: huge }), {
      code: "RESOURCE_BUDGET_EXCEEDED",
    });
    assert.equal(f.calls.length, 0);
  });
}

for (const id of Object.keys(models)) {
  test(`${id} propagates HTTP errors, supplier failures and malformed results`, async () => {
    const f = fixture(id),
      capability =
        id === "chat-completions"
          ? "chat"
          : id.endsWith("transcriptions")
            ? "transcribe"
            : "parseImage";
    const input =
      capability === "chat"
        ? chat
        : capability === "transcribe"
          ? audio(f)
          : image(f);
    f.respond(() =>
      Response.json({ message: "rate limited" }, { status: 429 }),
    );
    await assert.rejects(f.invoke(capability, input), { code: "HTTP_ERROR" });
    f.respond(() =>
      Response.json(
        capability === "transcribe"
          ? { code: 50505, message: "Model unavailable" }
          : { error: { message: "Model unavailable" } },
      ),
    );
    await assert.rejects(f.invoke(capability, input), {
      code: "PROVIDER_ERROR",
    });
    f.respond(() => Response.json({}));
    await assert.rejects(f.invoke(capability, input));
    f.respond(() =>
      Response.json(
        capability === "transcribe" ? { text: 42 } : completion(42),
      ),
    );
    await assert.rejects(f.invoke(capability, input));
  });
}

for (const model of asrModels)
  test(`${model} preserves filenames and derives M4A extensions from browser MIME types`, async () => {
    const f = fixture("transcriptions", model);
    f.respond(() => Response.json({ text: "Hello" }));
    const input = audio(f);
    await f.invoke("transcribe", {
      audio: { ...input.audio, filename: "recording.wav" },
    });
    assert.equal(f.calls[0].init.body.get("file").name, "recording.wav");
    const webm = f.assets.put(
      new Blob([Uint8Array.of(1)], { type: "audio/webm;codecs=opus" }),
    );
    await f.invoke("transcribe", { audio: webm });
    assert.equal(f.calls[1].init.body.get("file").name, "audio.webm");
    for (const mimeType of ["audio/mp4", "audio/x-m4a"]) {
      const m4a = f.assets.put(
        new Blob([Uint8Array.of(1)], { type: mimeType }),
      );
      await f.invoke("transcribe", { audio: m4a });
      assert.equal(f.calls.at(-1).init.body.get("file").name, "audio.m4a");
    }
  });

test("transcription rejects foreign assets and missing timestamp results", async () => {
  const f = fixture("transcriptions");
  await assert.rejects(
    f.invoke("transcribe", {
      audio: { assetId: "asset-999", mimeType: "audio/wav" },
    }),
    { code: "ASSET_UNAVAILABLE" },
  );
  f.respond(() => Response.json({ text: "Hello" }));
  await assert.rejects(
    f.invoke("transcribe", { ...audio(f), requireTimestamps: true }),
    { code: "INVALID_RESPONSE" },
  );
});

test("separate transcription definitions declare the tested timestamp capabilities", () => {
  const service = pack.manifest.services.find(item => item.id === "transcriptions");
  assert.deepEqual(service.models.map(item => item.id), [asrModels[0]]);
  const first = fixture("transcriptions").instance;
  const second = fixture("xingchen-transcriptions").instance;
  assert.equal(first.pluginConfig.model, asrModels[0]);
  assert.equal(second.pluginConfig.model, asrModels[1]);
  second.pluginConfig.model = "custom/asr";
  assert.equal(first.pluginConfig.model, asrModels[0]);
  assert.ok(!first.provider.capabilities.transcribe.timestamps);
  assert.equal(second.provider.capabilities.transcribe.timestamps, true);
});

test("transcription normalizes gateway errors and malformed successful responses", async () => {
  const f = fixture("transcriptions"), input = audio(f);
  for (const status of [502, 504]) {
    f.respond(() => new Response("<html>private gateway response</html>", { status }));
    await assert.rejects(f.invoke("transcribe", input), { code: "HTTP_ERROR" });
  }
  for (const body of ["<html>private gateway response</html>", "", '{"text":']) {
    f.respond(() => new Response(body));
    await assert.rejects(f.invoke("transcribe", input), {
      code: "INVALID_RESPONSE",
      message: "Invalid transcription JSON.",
    });
  }
  f.respond(() => Response.json({ message: "Model unavailable" }));
  await assert.rejects(f.invoke("transcribe", input), {
    code: "PROVIDER_ERROR",
    message: "Model unavailable",
  });
});
