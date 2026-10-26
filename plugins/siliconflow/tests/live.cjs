const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { load } = require("../../openrouter/tests/host.cjs");
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

const key = process.env.SILICONFLOW_API_KEY;
delete process.env.SILICONFLOW_API_KEY;
if (!key || !process.argv[2])
  throw new Error(
    "Provide SILICONFLOW_API_KEY and the directory containing speech.wav and ocr.png.",
  );
const assetDir = path.resolve(process.argv[2]);
const pack = readProviderPackage(
  new Uint8Array(buildPackage(path.resolve(__dirname, "..")).bytes),
);
const results = [];
const redact = (text) =>
  String(text)
    .split(key)
    .join("[redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]");

async function invoke(serviceId, capability, input, streaming = false) {
  const instance = createServiceInstance(
    pack.manifest,
    serviceId,
    pack.implementations[serviceId],
    { apiKey: key },
    "live-" + serviceId,
  );
  const assets = createAssetStore(),
    events = [];
  if (capability === "transcribe")
    input = {
      ...input,
      audio: assets.put(
        new Blob([fs.readFileSync(path.join(assetDir, "speech.wav"))], {
          type: "audio/wav",
        }),
      ),
    };
  if (capability === "parseImage")
    input = {
      ...input,
      image: assets.put(
        new Blob([fs.readFileSync(path.join(assetDir, "ocr.png"))], {
          type: "image/png",
        }),
      ),
    };
  const registry = createProviderRegistry({
    resolveInstance: () => instance,
    createContext: (api, invocation) => ({
      ...invocation,
      ...createTransportBroker(api, { signal: invocation.signal, assets }),
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
      script: require("./script-runner.cjs"),
    },
  });
  const call = registry.invoke(instance.apiSlug, capability, input, {
    streaming: streaming ? "required" : "disabled",
    timeoutMs: 120000,
  });
  const consumed = (async () => {
    try {
      for await (const event of call.events) events.push(event);
    } catch {
      /* the result exposes errors */
    }
  })();
  try {
    return { result: await call.result, events };
  } finally {
    await call.finished;
    await consumed;
    assets.clear();
  }
}

async function check(
  name,
  serviceId,
  capability,
  input,
  verify,
  streaming = false,
) {
  const started = Date.now();
  try {
    const { result, events } = await invoke(
      serviceId,
      capability,
      input,
      streaming,
    );
    verify(result, events);
    const row = {
      name,
      serviceId,
      capability,
      passed: true,
      durationMs: Date.now() - started,
      result,
      eventCount: events.length,
    };
    results.push(row);
    console.log(
      JSON.stringify({
        name,
        passed: true,
        durationMs: row.durationMs,
        eventCount: row.eventCount,
      }),
    );
  } catch (error) {
    const row = {
      name,
      serviceId,
      capability,
      passed: false,
      durationMs: Date.now() - started,
      code: error.code,
      message: redact(error.message),
    };
    results.push(row);
    console.log(JSON.stringify(row));
  }
}

(async () => {
  const text = {
    messages: [
      { role: "user", content: "Reply with exactly: Hello SiliconFlow" },
    ],
  };
  const validChat = (result) => assert.match(result.text, /Hello SiliconFlow/i);
  await check("chat", "chat-completions", "chat", text, validChat);
  await check(
    "chat stream",
    "chat-completions",
    "chat",
    text,
    (result, events) => {
      validChat(result);
      assert.ok(events.some((event) => event.type === "text.delta"));
    },
    true,
  );
  const items = [
    { id: "hello", text: "Hello world." },
    { id: "thanks", text: "Thank you." },
  ];
  const translation = {
    items,
    sourceLanguage: "en",
    targetLanguage: "zh",
    translationMode: "batch",
    outputProtocol: "json",
  };
  const validTranslation = (result) => {
    assert.deepEqual(
      result.items.map((item) => item.id),
      items.map((item) => item.id),
    );
    assert.ok(result.items.every((item) => /[\u4e00-\u9fff]/.test(item.text)));
  };
  await check(
    "single translation",
    "chat-completions",
    "translate",
    {
      ...translation,
      items: [items[0]],
      translationMode: "single",
      outputProtocol: "text",
    },
    (result) => {
      assert.equal(result.items[0].id, "hello");
      assert.match(result.items[0].text, /[\u4e00-\u9fff]/);
    },
  );
  await check(
    "batch translation",
    "chat-completions",
    "translate",
    translation,
    validTranslation,
  );
  await check(
    "batch translation stream",
    "chat-completions",
    "translate",
    translation,
    (result, events) => {
      validTranslation(result);
      assert.ok(events.length > 0);
    },
    true,
  );
  await check(
    "Qwen transcription",
    "qwen-transcriptions",
    "transcribe",
    {},
    (result) => {
      assert.match(result.text, /speech|recognition|test/i);
    },
  );
  await check(
    "XingChen transcription",
    "xingchen-transcriptions",
    "transcribe",
    {},
    (result) => {
      assert.match(result.text, /speech|recognition|test/i);
    },
  );
  for (const serviceId of ["paddleocr", "deepseek-ocr"])
    await check(
      serviceId + " full-text OCR",
      serviceId,
      "parseImage",
      { mode: "doc" },
      (result) => {
        assert.match(result.text, /SiliconFlow/i);
        assert.match(result.text, /123\.45/);
        assert.equal(
          result.text.replace(/\s+/g, "").toLowerCase(),
          "hellosiliconflowinvoicetotal:123.45",
        );
        assert.ok(result.items.every((item) => item.poly === null));
      },
    );
  const report = {
    testedAt: new Date().toISOString(),
    pluginId: pack.manifest.id,
    version: pack.manifest.version,
    results,
  };
  if (process.argv[3])
    fs.writeFileSync(
      path.resolve(process.argv[3]),
      redact(JSON.stringify(report, null, 2)) + "\n",
    );
  if (results.some((item) => !item.passed)) process.exitCode = 1;
})().catch((error) => {
  console.error(redact(error.message));
  process.exitCode = 1;
});
