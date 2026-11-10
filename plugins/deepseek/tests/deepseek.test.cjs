const test = require("node:test");
const assert = require("node:assert/strict");
const manifest = require("../manifest.json");
const rules = require("../services/chat.json");
const visionRules = require("../services/vision.json");

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

test("DeepSeek declares document image extraction on a separate Flash service", () => {
  const vision = manifest.services.find(({ id }) => id === "vision");
  const chat = manifest.services.find(({ id }) => id === "chat-completions");
  assert.deepEqual(vision.implementation, { kind: "declarative", entry: "services/vision.json" });
  assert.deepEqual(vision.capabilities, {
    parseImage: {
      handler: "parseImage",
      inputModalities: ["image"],
      taskModes: ["doc"],
      coordinates: false,
      outputModes: ["complete"],
    },
  });
  assert.deepEqual(Object.keys(vision.nameI18n).sort(), Object.keys(manifest.nameI18n).sort());
  assert.deepEqual(vision.models.map(({ id }) => id), ["deepseek-flash"]);
  assert.equal(vision.settings.find(({ key }) => key === "model").defaultValue, "deepseek-flash");
  assert.deepEqual(chat.capabilities.chat.inputModalities, ["text"]);
  assert.equal(visionRules.format, "protocol");
  const handler = visionRules.handlers.parseImage;
  assert.equal(handler.task, "parseImage");
  assert.equal(handler.protocol, "openai-chat-completions");
  assert.deepEqual(handler.request, {
    baseUrl: { $ref: "config.baseUrl" },
    model: { $ref: "config.model" },
    auth: { type: "bearer", secret: { $secret: "apiKey" } },
    parameters: { thinking: { type: "disabled" } },
  });
});
