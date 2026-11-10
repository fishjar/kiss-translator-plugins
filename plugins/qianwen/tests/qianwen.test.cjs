const test = require("node:test");
const assert = require("node:assert/strict");
const { script, probe } = require("../../../tests/support/plugin.cjs");

const media = script("qianwen", "services/media.js");
const input = { audio: { mimeType: "audio/mp4" }, language: "en" };

test("ASR keeps AAC bytes, converts provider intervals and removes repeated prefix", async () => {
  const { ctx, config } = probe();
  const first = { begin_time: 240, end_time: 2480, text: "First", punctuation: "." };
  const second = { begin_time: 4480, end_time: 6640, text: " Second", punctuation: "." };
  const frame = (text, end, words, ended = true) => ({
    data: JSON.stringify({ output: {
      text, sentence: { begin_time: 240, end_time: end, text, words, sentence_end: ended },
    } }),
  });
  ctx.helpers.stream = { createSSEParser: () => ({
    push: () => [
      frame("First.", 2480, [{ ...first, fixed: false }]),
      frame("First. Sec", null, [], false),
      frame("First. Second.", 6640, [first, second]),
    ],
    finish() {},
  }) };
  ctx.helpers.openai.audio.parseTranscription = (response) => response.body;
  ctx.http.request = async (request) => {
    assert.match(request.url, /\/multimodal-generation\/generation$/);
    assert.equal(request.headers["X-DashScope-SSE"], "enable");
    assert.equal(request.body.parameters.format, "m4a");
    assert.equal(request.body.parameters.language_hints[0], "en");
    assert.equal(
      request.body.input.messages[0].content[0].input_audio.data,
      "data:audio/mp4;base64,AH+A/w==",
    );
    return { status: 200, headers: { "content-type": "text/event-stream" }, body: "stub" };
  };
  const result = await media.transcribe(input, config, ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    text: "First. Second.",
    segments: [
      { start: 0.24, end: 2.48, text: "First." },
      { start: 4.48, end: 6.64, text: "Second." },
    ],
    words: [
      { start: 0.24, end: 2.48, text: "First." },
      { start: 4.48, end: 6.64, text: " Second." },
    ],
  });
});

test("ASR propagates provider errors in a successful HTTP stream", async () => {
  const { ctx, config } = probe();
  ctx.http.request = async () => ({
    status: 200, headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "SERVER_ERROR", message: "provider error" }),
  });
  await assert.rejects(media.transcribe(input, config, ctx), { code: "PROVIDER_ERROR" });
});

test("Omni requests text streaming and exposes no artificial timing", async () => {
  const { ctx, config } = probe();
  ctx.helpers.openai.chatCompletions.createStreamParser = () => ({
    push() {},
    finish: () => ({ text: "[NO_SPEECH]" }),
  });
  ctx.http.stream = async function* (request) {
    assert.equal(request.body.stream, true);
    assert.equal(request.body.enable_thinking, false);
    const audio = request.body.messages[0].content[0].input_audio;
    assert.equal(audio.format, "m4a");
    assert.equal(audio.data, "data:audio/mp4;base64,AH+A/w==");
    yield { type: "headers", status: 200 };
  };
  const result = await media.transcribeOmni(input, config, ctx);
  assert.equal(result.text, "");
  assert.equal(result.segments, undefined);
  await assert.rejects(media.transcribeOmni({ ...input, requireTimestamps: true }, config, ctx),
    { code: "TASK_UNSUPPORTED" });
});
