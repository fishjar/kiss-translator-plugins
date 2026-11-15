const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("../../../tests/support/declarative-host.cjs");

for (const [plugin, service] of [
  ["deepseek", "chat-completions"],
  ["kimi", "kimi-code"],
  ["kimi", "open-platform"],
  ["openai-compatible-bundle", "chat-completions"],
  ["openrouter", "chat-completions"],
  ["qianwen", "chat"],
  ["siliconflow", "chat-completions"],
]) {
  test(`${plugin}/${service}: optional keys and HTTP endpoints use the production transport`, async () => {
    for (const apiKey of [undefined, "", "test-only-secret"]) {
      const config = { apiKey, baseUrl: "http://192.168.6.138:8088/v1" };
      const f = fixture(plugin, service, config);
      const field = f.instance.provider.settings.find((item) => item.key === "apiKey");
      assert.ok(!field.required);
      await f.invoke("chat", { messages: [{ role: "user", content: "Hello" }] });
      assert.equal(f.calls[0].init.headers.Authorization, apiKey ? "Bearer test-only-secret" : undefined);
      assert.equal(f.calls[0].url, config.baseUrl + "/chat/completions");
    }
  });
}
