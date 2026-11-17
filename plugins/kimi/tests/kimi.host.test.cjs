const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("../../../tests/support/declarative-host.cjs");
const { load } = require("../../../tests/support/host.cjs");
const { withDefaultPromptInput } = load("providers/defaultPrompts.js");

const sse = (frames) =>
  new Response(frames.map((data) => `data: ${data}\n\n`).join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });

for (const [service, url, model] of [
  ["kimi-code", "https://api.kimi.com/coding/v1/chat/completions", "kimi-for-coding"],
  ["open-platform", "https://api.moonshot.cn/v1/chat/completions", "kimi-k2.6"],
]) {
  test(`Kimi ${service}: default instance sends disabled thinking without sampling parameters`, async () => {
    const f = fixture("kimi", service);
    assert.equal(f.config.model, model);
    assert.equal(f.config.thinkingMode, "disabled");
    assert.equal(f.config.thinkingEffort, "_default");
    const result = await f.invoke("chat", { messages: [{ role: "user", content: "Hello" }] });
    assert.equal(result.text, "Hello");
    const [{ url: sent, init }] = f.calls;
    assert.equal(sent, url);
    assert.equal(init.headers.Authorization, "Bearer test-only-secret");
    const body = JSON.parse(init.body);
    assert.equal(body.model, model);
    assert.equal(body.stream, false);
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.ok(!Object.hasOwn(body, "reasoning_effort"));
    assert.ok(!Object.hasOwn(body, "temperature"));
    assert.ok(!Object.hasOwn(body, "top_p"));
    assert.equal(body.max_completion_tokens, 16384);
  });
}

test("Kimi model rules run in the production script interpreter", async () => {
  const f = fixture("kimi", "kimi-code");
  for (const [model, mode, effort, expected] of [
    ["k3.1-pro", "disabled", "_default", { thinking: { type: "enabled" }, reasoning_effort: "low" }],
    ["k3", "enabled", "max", { thinking: { type: "enabled" }, reasoning_effort: "max" }],
    ["kimi-k3", "disabled", "_default", { reasoning_effort: "low" }],
    ["kimi-k2.7-code", "enabled", "high", {}],
    ["kimi-for-coding", "auto", "high", {}],
  ]) {
    Object.assign(f.config, { model, thinkingMode: mode, thinkingEffort: effort });
    await f.invoke("chat", { messages: [{ role: "user", content: "Hello" }] });
    const body = JSON.parse(f.calls.at(-1).init.body);
    const actual = {};
    for (const key of ["thinking", "reasoning_effort"]) if (Object.hasOwn(body, key)) actual[key] = body[key];
    assert.deepEqual(actual, expected, `${model} ${mode} ${effort}`);
  }
});

test("Kimi translation ignores reasoning_content in complete and streaming responses", async () => {
  const f = fixture("kimi", "open-platform");
  const input = withDefaultPromptInput(f.instance, "translate", {
    items: [{ id: "a", text: "Hello" }],
    targetLanguage: "zh-CN",
    translationMode: "single",
    outputProtocol: "text",
  });
  f.respond(() => Response.json({
    choices: [{
      message: { reasoning_content: "先分析句子结构。", content: "你好" },
      finish_reason: "stop",
    }],
  }));
  assert.deepEqual(await f.invoke("translate", input), { items: [{ id: "a", text: "你好" }] });

  f.ctx.options.streaming = true;
  const emitted = [];
  f.ctx.emit = async (event) => emitted.push(event);
  f.respond(() => sse([
    JSON.stringify({ choices: [{ delta: { reasoning_content: "先分析" }, finish_reason: null }] }),
    JSON.stringify({ choices: [{ delta: { content: "你好" }, finish_reason: null }] }),
    JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
    "[DONE]",
  ]));
  assert.deepEqual(await f.invoke("translate", input), { items: [{ id: "a", text: "你好" }] });
  assert.equal(JSON.parse(f.calls.at(-1).init.body).stream, true);
  assert.ok(emitted.length > 0);
  assert.ok(emitted.every((event) => event.type.startsWith("item.")));
  assert.ok(!JSON.stringify(emitted).includes("先分析"));
});
