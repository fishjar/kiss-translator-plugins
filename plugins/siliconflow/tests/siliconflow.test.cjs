const test = require("node:test");
const assert = require("node:assert/strict");
const { script, probe } = require("../../../tests/support/plugin.cjs");
const { transcribe } = script("siliconflow", "services/transcribe.js");
const { parseImage } = script("siliconflow", "services/deepseek-ocr.js");

test("ASR preserves filenames, derives M4A extensions and sends only file/model", async () => {
  for (const filename of [undefined, "recording.m4a"]) {
    const f = probe();
    const result = await transcribe(
      {
        audio: {
          assetId: "asset-1",
          mimeType: "audio/mp4; codecs=aac",
          filename,
        },
      },
      f.config,
      f.ctx,
    );
    assert.equal(result.text, "transcribed");
    const request = f.requests[0];
    assert.equal(request.url, "https://sdk-stub.invalid/audio/transcriptions");
    assert.equal(request.bodyType, "multipart");
    assert.deepEqual(Object.keys(request.body).sort(), ["file", "model"]);
    assert.equal(request.body.file.filename, filename || "audio.m4a");
  }
});

test("ASR reports provider failures and rejects unknown containers", async () => {
  const f = probe();
  await assert.rejects(
    transcribe({ audio: { mimeType: "audio/unknown" } }, f.config, f.ctx),
    { code: "INVALID_ASSET" },
  );
  f.ctx.http.request = async () => ({
    body: JSON.stringify({ message: "vendor error" }),
  });
  await assert.rejects(
    transcribe({ audio: { mimeType: "audio/wav" } }, f.config, f.ctx),
    /vendor error/,
  );
});

test("ASR delegates HTTP failures to the SDK without swallowing errors", async () => {
  const f = probe(), input = { audio: { mimeType: "audio/wav" } };
  for (const response of [
    { status: 502, body: "<html>gateway</html>" },
    { status: 504, body: '{"message":"gateway"}' },
  ]) {
    const failure = Object.assign(new Error("SDK error"), { code: "SDK_TEST_ERROR" });
    f.ctx.http.request = async () => response;
    f.ctx.helpers.openai.audio.parseTranscription = (actual) => {
      assert.equal(actual, response);
      throw failure;
    };
    await assert.rejects(transcribe(input, f.config, f.ctx), (error) => error === failure);
  }
});

test("ASR normalizes malformed JSON without requiring a newer SDK parser", async () => {
  const f = probe(), input = { audio: { mimeType: "audio/wav" } };
  let parsed = false;
  f.ctx.helpers.openai.audio.parseTranscription = (response) => {
    parsed = true;
    return JSON.parse(response.body);
  };
  for (const body of ["<html>private gateway response</html>", "", '{"text":']) {
    f.ctx.http.request = async () => ({ status: 200, body });
    await assert.rejects(transcribe(input, f.config, f.ctx), {
      code: "INVALID_RESPONSE",
      message: "Invalid transcription JSON.",
    });
  }
  assert.equal(parsed, false);
  f.ctx.http.request = async () => ({ status: 200, body: '{"text":"Hello"}' });
  assert.equal((await transcribe(input, f.config, f.ctx)).text, "Hello");
  assert.equal(parsed, true);
});

test("DeepSeek OCR puts image before custom prompt and preserves returned text", async () => {
  const f = probe();
  const result = await parseImage(
    {
      image: { assetId: "asset-1", mimeType: "image/png" },
      prompt: "custom prompt",
    },
    f.config,
    f.ctx,
  );
  const content = f.built[0].messages[0].content;
  assert.equal(content[0].type, "image_url");
  assert.equal(content[0].image_url.url, "data:image/png;base64,AH+A/w==");
  assert.equal(content[1].text, "custom prompt");
  assert.equal(result.text, "recognized\nsecond line");
  assert.equal(result.format, "text");
  assert.ok(result.items.every((item) => item.poly === null));
});

test("OCR refuses unsupported or oversized assets before request construction", async () => {
  const f = probe();
  await assert.rejects(
    parseImage({ image: { mimeType: "image/svg+xml" } }, f.config, f.ctx),
    { code: "INVALID_ASSET" },
  );
  f.ctx.assets.read = async () => new ArrayBuffer(8 * 1024 * 1024 + 1);
  await assert.rejects(
    parseImage({ image: { mimeType: "image/png" } }, f.config, f.ctx),
    { code: "RESOURCE_BUDGET_EXCEEDED" },
  );
  assert.equal(f.requests.length, 0);
});
