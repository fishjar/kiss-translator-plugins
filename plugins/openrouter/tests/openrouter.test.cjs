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
    assert.equal(f.requests[0].body.response_format, "verbose_json");
    assert.deepEqual(Array.from(f.requests[0].body.timestamp_granularities), ["segment", "word"]);
    assert.equal(f.built[0].auth.secret.key, "apiKey");
  }
});

test("transcription retains SDK-normalized segment and word timestamps", async () => {
  const f = probe();
  const expected = { text: "Hello.", segments: [
    { start: 0, end: 1, text: "Hello.", words: [{ start: 0, end: 1, text: "Hello." }] },
  ] };
  f.ctx.helpers.openai.audio.parseTranscription = () => expected;
  assert.equal(await transcribe({ audio: { mimeType: "audio/wav" } }, f.config, f.ctx), expected);
});

test("genuine zero-duration words are preserved for the current subtitle processor", async () => {
  const f = probe();
  f.ctx.helpers.openai.audio.parseTranscription = () => ({
    text: "A test.", segments: [{ start: 0, end: 1, text: "A test.", words: [
      { start: 0, end: 0.5, text: "A" }, { start: 1, end: 1, text: " test." },
    ] }],
  });
  const result = await transcribe({ audio: { mimeType: "audio/wav" } }, f.config, f.ctx);
  assert.equal(result.text, "A test.");
  assert.equal(result.segments[0].text, "A test.");
  assert.equal(result.segments[0].end, 1);
  assert.equal(result.segments[0].words[1].start, 1);
  assert.equal(result.segments[0].words[1].end, 1);
  assert.equal(result.segments[0].words[1].text, " test.");
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
