const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("../../../tests/support/declarative-host.cjs");
const manifest = require("../manifest.json");
const compatible = require("../../openai-compatible-bundle/manifest.json");

const completion = (text) => Response.json({
  choices: [{ message: { content: text }, finish_reason: "stop" }],
});
const stream = (text, terminal = true) => new Response(
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n` +
    (terminal ? 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n' : ""),
  { headers: { "Content-Type": "text/event-stream" } },
);

test("two services preserve compatible prompts and use editable local defaults", () => {
  assert.equal(manifest.id, "llama-cpp");
  assert.equal(manifest.version, "1.0.0");
  assert.deepEqual(manifest.services.map((s) => s.id), ["chat-completions", "vision"]);
  assert.equal(manifest.sharedSettings.find((f) => f.key === "apiKey").required, undefined);
  for (const service of manifest.services) {
    const f = fixture("llama-cpp", service.id);
    assert.equal(f.config.baseUrl, "http://127.0.0.1:8080/v1");
    assert.equal(f.config.model, "Qwen3.8-27B");
    assert.deepEqual(service.models, [{ id: "Qwen3.8-27B", name: "Qwen3.8-27B" }]);
    const original = compatible.services.find((s) => s.id === service.id);
    assert.deepEqual(service.capabilities, original.capabilities);
    assert.deepEqual(service.defaultPrompts, original.defaultPrompts);
  }
});

test("both services support local, LAN and HTTPS endpoints and optional bearer keys", async () => {
  for (const baseUrl of [undefined, "http://192.168.6.138:8088/proxy/v1/", "https://llama.example/v1"]) {
    for (const apiKey of [undefined, "", "test-only-secret"]) {
      for (const service of manifest.services) {
        const f = fixture("llama-cpp", service.id, {
          ...(baseUrl && { baseUrl }), apiKey, model: "custom-model",
        });
        const image = f.assets.put(new Blob([Uint8Array.of(0, 127, 128, 255)], { type: "image/png" }));
        f.respond(() => completion("first\nsecond"));
        const result = service.id === "vision"
          ? await f.invoke("parseImage", { image, prompt: "Read the label" })
          : await f.invoke("chat", { messages: [{ role: "user", content: "Hello" }] });
        const { url, init } = f.calls[0];
        const body = JSON.parse(init.body);
        assert.equal(url, f.config.baseUrl.replace(/\/+$/, "") + "/chat/completions");
        assert.equal(init.headers.Authorization, apiKey ? "Bearer test-only-secret" : undefined);
        assert.equal(body.model, "custom-model");
        assert.equal(body.reasoning_effort, undefined);
        assert.equal(result.text, "first\nsecond");
        if (service.id === "vision") {
          assert.deepEqual(body.messages[0].content, [
            { type: "text", text: "Read the label" },
            { type: "image_url", image_url: { url: "data:image/png;base64,AH+A/w==" } },
          ]);
          assert.equal(result.format, "markdown");
          assert.deepEqual(result.items, [{ text: "first", poly: null }, { text: "second", poly: null }]);
        }
      }
    }
  }
});

for (const handler of ["chat", "translate"]) {
  test(`${handler}: complete and streaming responses use the real parsers`, async () => {
    const f = fixture("llama-cpp", "chat-completions", { apiKey: "", translationTemperature: 0.25 });
    const input = handler === "chat"
      ? { messages: [{ role: "user", content: "Hello" }] }
      : { items: [{ id: "a", text: "Hello" }], targetLanguage: "zh", translationMode: "batch", outputProtocol: "json" };
    const text = handler === "chat" ? "你好" : '[{"id":"a","text":"你好"}]';
    const emitted = [];
    f.ctx.emit = async (event) => emitted.push(event);
    for (const streaming of [false, true]) {
      f.ctx.options.streaming = streaming;
      f.respond(() => streaming ? stream(text) : completion(text));
      const result = await f.invoke(handler, input);
      if (handler === "chat") assert.equal(result.text, "你好");
      else assert.deepEqual(result.items, [{ id: "a", text: "你好" }]);
      const body = JSON.parse(f.calls.at(-1).init.body);
      assert.equal(body.stream, streaming);
      assert.equal(body.reasoning_effort, undefined);
      if (handler === "translate") assert.equal(body.temperature, 0.25);
    }
    assert.ok(emitted.length > 0);
    f.respond(() => stream(text, false));
    await assert.rejects(f.invoke(handler, input));
  });
}
