const test = require("node:test");
const assert = require("node:assert/strict");
const manifest = require("../manifest.json");
const rules = require("../services/chat.json");

test("DeepSeek declares the actual conditional chat and translation rules", () => {
  assert.equal(rules.format, "protocol");
  const service = manifest.services.find((item) => item.id === "chat-completions");
  assert.deepEqual(service.implementation, { kind: "declarative", entry: "services/chat.json" });
  for (const task of ["chat", "translate"]) {
    const handler = rules.handlers[service.capabilities[task].handler];
    assert.equal(handler.task, task);
    assert.equal(handler.protocol, "openai-chat-completions");
    assert.deepEqual(handler.request.parameters.thinking, {
      $if: { $ref: "config.thinkingMode", equals: "auto" },
      else: { type: { $ref: "config.thinkingMode" } },
    });
    assert.deepEqual(handler.request.parameters.reasoning_effort, {
      $if: { $ref: "config.thinkingMode", equals: "enabled" },
      then: { $ref: "config.thinkingEffort", omitValues: ["_default"] },
    });
  }
  assert.ok(!Object.hasOwn(rules.handlers.chat.request.parameters, "temperature"));
  assert.deepEqual(rules.handlers.translate.request.parameters.temperature, {
    $if: { $ref: "config.thinkingMode", equals: "disabled" },
    then: { $ref: "config.translationTemperature" },
  });
});
