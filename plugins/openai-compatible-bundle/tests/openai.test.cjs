const test = require("node:test");
const assert = require("node:assert/strict");
const { script, probe } = require("../../../tests/support/plugin.cjs");
const { chat } = script("openai-compatible-bundle", "services/chat.js");

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
