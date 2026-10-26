const test = require("node:test");
const assert = require("node:assert/strict");
const { script, probe } = require("../../../tests/support/plugin.cjs");
const { transcribe } = script("openrouter", "services/transcribe.js");

test("transcription maps raw audio to the provider JSON endpoint using SDK boundaries", async () => {
  for (const [mimeType, format] of [
    ["audio/wav", "wav"],
    ["audio/mp4; codecs=mp4a.40.2", "m4a"],
    ["audio/mpeg", "mp3"],
  ]) {
    const f = probe();
    const result = await transcribe(
      { audio: { assetId: "asset-1", mimeType }, language: "en" },
      f.config,
      f.ctx,
    );
    assert.equal(result.text, "transcribed");
    assert.equal(
      f.requests[0].url,
      "https://sdk-stub.invalid/audio/transcriptions",
    );
    assert.equal(f.requests[0].body.input_audio.format, format);
    assert.equal(f.requests[0].body.input_audio.data, "AH+A/w==");
    assert.equal(f.requests[0].body.language, "en");
    assert.equal(f.built[0].auth.secret.key, "apiKey");
  }
});

test("unsupported audio rejects before network and asset failures propagate", async () => {
  const f = probe();
  await assert.rejects(
    transcribe({ audio: { mimeType: "audio/unknown" } }, f.config, f.ctx),
    /Unsupported/,
  );
  assert.equal(f.requests.length, 0);
  f.ctx.assets.read = async () => {
    throw new Error("cancelled");
  };
  await assert.rejects(
    transcribe({ audio: { mimeType: "audio/wav" } }, f.config, f.ctx),
    /cancelled/,
  );
});
