const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("../../../tests/support/declarative-host.cjs");

const completion = (text) => ({ choices: [{ message: { content: text }, finish_reason: "stop" }] });
const sse = (data) => new Response(data, { headers: { "content-type": "text/event-stream" } });

test("the installed chat service sends images and maps thinking settings", async () => {
  for (const [thinkingMode, expected] of [["disabled", false], ["enabled", true], ["auto", undefined]]) {
    const chat = fixture("qianwen", "chat", { thinkingMode });
    chat.respond(() => Response.json(completion("visible text")));
    const asset = chat.assets.put(new Blob(["png"], { type: "image/png" }));
    const result = await chat.invoke("chat", { messages: [
      { role: "user", content: [{ type: "image", asset }, { type: "text", text: "Read it." }] },
    ] });
    const [{ url, init }] = chat.calls;
    assert.match(url, /maas\.qianwenaiapi\.com\/compatible-mode\/v1\/chat\/completions$/);
    const body = JSON.parse(init.body);
    assert.equal(body.enable_thinking, expected);
    assert.equal(body.messages[0].content[0].image_url.url, "data:image/png;base64,cG5n");
    assert.equal(result.text, "visible text");
  }
});

test("Sval Omni extracts image text and rejects truncated transcriptions", async () => {
  const omni = fixture("qianwen", "omni");
  const image = omni.assets.put(new Blob(["png"], { type: "image/png" }));
  const delta = 'data: {"choices":[{"delta":{"content":"read me"}}]}\n\n';
  omni.respond(() => sse(delta + 'data: {"choices":[{"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
  const result = await omni.invoke("parseImage", { image, mode: "doc" });
  assert.equal(result.text, "read me");
  assert.equal(result.items[0].poly, null);
  const audio = omni.assets.put(new Blob(["m4a"], { type: "audio/mp4" }));
  omni.respond(() => sse(delta));
  await assert.rejects(omni.invoke("transcribeOmni", { audio }), { code: "INCOMPLETE_RESPONSE" });
});

test("Sval ASR accepts the native SSE envelope and yields aligned host words", async () => {
  const asr = fixture("qianwen", "asr");
  const audio = asr.assets.put(new Blob(["wav"], { type: "audio/wav" }));
  const sentence = {
    begin_time: 240, end_time: 2480, sentence_end: true, text: "First.",
    words: [{ begin_time: 240, end_time: 2480, text: "First", punctuation: "." }],
  };
  const output = { text: "First.", sentence };
  asr.respond(() => sse("event:result\ndata:" + JSON.stringify({ output }) + "\n\n"));
  const result = await asr.invoke("transcribe", { audio, requireTimestamps: true });
  assert.equal(result.text, "First.");
  assert.equal(result.segments[0].words[0].start, 0.24);
  assert.equal(result.segments[0].words[0].text, "First.");
  asr.respond(() => Response.json({
    code: "CLIENT_ERROR", message: "ASR_RESPONSE_HAVE_NO_WORDS",
  }, { status: 400 }));
  await assert.rejects(asr.invoke("transcribe", { audio }), {
    code: "HTTP_ERROR", message: "Provider returned HTTP 400",
  });
});
