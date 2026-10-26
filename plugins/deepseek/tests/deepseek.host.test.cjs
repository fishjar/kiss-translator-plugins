const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("../../../tests/support/declarative-host.cjs");

for (const handler of ["chat", "translate"]) {
  test(`DeepSeek ${handler} maps thinking modes, effort and zero temperature with the real executor`, async () => {
    const f = fixture("deepseek", "chat-completions");
    const input = handler === "chat"
      ? { messages: [{ role: "user", content: "Hello" }] }
      : { items: [{ id: "a", text: "Hello" }], targetLanguage: "zh", translationMode: "single", outputProtocol: "text" };
    assert.equal(f.config.thinkingEffort, "high");
    for (const mode of ["auto", "enabled", "disabled"]) {
      for (const effort of ["_default", "low", "high", "max"]) {
        for (const temperature of [0, 0.7]) {
          Object.assign(f.config, { thinkingMode: mode, thinkingEffort: effort, translationTemperature: temperature });
          const result = await f.invoke(handler, input);
          if (handler === "chat") assert.equal(result.text, "Hello");
          else assert.deepEqual(result, { items: [{ id: "a", text: "Hello" }] });
          const { url, init } = f.calls.at(-1), body = JSON.parse(init.body);
          assert.equal(url, "https://api.deepseek.com/chat/completions");
          assert.equal(init.headers.Authorization, "Bearer test-only-secret");
          assert.equal(body.model, f.config.model);
          if (mode === "auto") assert.ok(!Object.hasOwn(body, "thinking"));
          else assert.deepEqual(body.thinking, { type: mode });
          if (mode === "enabled" && effort !== "_default") assert.equal(body.reasoning_effort, effort);
          else assert.ok(!Object.hasOwn(body, "reasoning_effort"));
          if (handler === "translate" && mode === "disabled") assert.equal(body.temperature, temperature);
          else assert.ok(!Object.hasOwn(body, "temperature"));
        }
      }
    }
  });
}
