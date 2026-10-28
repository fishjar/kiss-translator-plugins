const test = require("node:test");
const assert = require("node:assert/strict");
const { script, probe } = require("../../../tests/support/plugin.cjs");
const { chat } = script("openai-compatible-bundle", "services/chat.js");
const { parseImage } = script("openai-compatible-bundle", "services/vision.js");
const manifest = require("../manifest.json");

test("speech and transcription declare their request and result mappings", () => {
  const speech = require("../services/speech.json");
  const transcription = require("../services/transcription.json");
  for (const [id, rules, handler, entry] of [
    ["speech", speech, "synthesizeSpeech", "services/speech.json"],
    ["transcriptions", transcription, "transcribe", "services/transcription.json"],
  ]) {
    const service = manifest.services.find((item) => item.id === id);
    assert.deepEqual(service.implementation, { kind: "declarative", entry });
    assert.equal(service.capabilities[handler].handler, handler);
    assert.equal(rules.format, "http");
    assert.deepEqual(rules.handlers[handler].request.auth, { type: "bearer", secret: { $secret: "apiKey" } });
  }
  assert.deepEqual(speech.handlers.synthesizeSpeech.request, {
    url: { $url: { base: "config.baseUrl", path: "audio/speech" } },
    method: "POST", headers: { "Content-Type": "application/json" },
    auth: { type: "bearer", secret: { $secret: "apiKey" } },
    bodyType: "json", responseType: "asset",
    body: {
      model: { $ref: "config.model" }, voice: { $ref: "input.voice", fallbackRef: "config.voice" },
      input: { $ref: "input.text" }, speed: { $ref: "input.speed", omitIfEmpty: true }, response_format: "mp3",
    },
  });
  assert.deepEqual(speech.handlers.synthesizeSpeech.response, { kind: "asset" });
  assert.deepEqual(transcription.handlers.transcribe.request, {
    url: { $url: { base: "config.baseUrl", path: "audio/transcriptions" } },
    method: "POST", auth: { type: "bearer", secret: { $secret: "apiKey" } },
    bodyType: "multipart", responseType: "text",
    body: {
      file: { $asset: "input.audio" }, model: { $ref: "config.model" }, response_format: "json",
      language: { $ref: "input.language", omitIfEmpty: true, omitValues: ["auto"], transform: "languages.toIso6391" },
    },
  });
  assert.deepEqual(transcription.handlers.transcribe.response, {
    kind: "json", errorPath: "error.message", map: { text: { $ref: "response.text" } },
  });
});

test("vision reads binary assets, maps prompts and model parameters, and never fabricates coordinates", async () => {
  for (const [model, effort] of [["gpt-6-luna", "none"], ["gpt-6-astra", "low"], ["other-model", undefined]]) {
    for (const prompt of [undefined, "Only numbers"]) {
      const f = probe(), image = { assetId: "image-1", mimeType: "image/png" };
      const read = f.ctx.assets.read;
      let reads = 0;
      f.ctx.assets.read = async (actual) => {
        assert.equal(actual, image);
        reads++;
        return read(actual);
      };
      const result = await parseImage({ image, prompt }, { ...f.config, model }, f.ctx);
      assert.equal(reads, 1);
      const built = f.built[0];
      assert.equal(built.baseUrl, f.config.baseUrl);
      assert.equal(built.model, model);
      assert.equal(built.reasoning_effort, effort);
      assert.equal(built.auth.secret.key, "apiKey");
      assert.equal(built.messages[0].content[0].text, prompt || "Extract the visible text faithfully. Output only the recognized text.");
      assert.equal(built.messages[0].content[1].image_url.url, "data:image/png;base64,AH+A/w==");
      assert.equal(f.requests.length, 1);
      assert.equal(result.text, "recognized\nsecond line");
      assert.equal(result.format, "markdown");
      assert.deepEqual(Array.from(result.items, (item) => ({ ...item })), [
        { text: "recognized", poly: null }, { text: "second line", poly: null },
      ]);
    }
  }
});

test("chat selects reasoning and sampling parameters by model without a host checkout", async () => {
  for (const [model, effort, sampling] of [
    ["gpt-6-luna", "none", true],
    ["gpt-6-astra", "low", false],
    ["other-model", undefined, true],
  ]) {
    const f = probe();
    await chat(
      { messages: [{ role: "user", content: "Hello" }] },
      { ...f.config, model },
      f.ctx,
    );
    assert.equal(f.built[0].reasoning_effort, effort);
    assert.equal(f.built[0].temperature, sampling ? 0.3 : undefined);
    assert.equal(f.built[0].auth.secret.key, "apiKey");
  }
});
