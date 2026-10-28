const test = require("node:test");
const assert = require("node:assert/strict");
const manifest = require("../manifest.json");
const { evaluate } = require("../services/decisions.json").handlers;

test("decisions declare their dedicated endpoint and pass questions through directly", () => {
  const service = manifest.services.find((item) => item.id === "decisions");
  assert.deepEqual(service.implementation, {
    kind: "declarative",
    entry: "services/decisions.json",
  });
  assert.deepEqual(evaluate.request.url, {
    $url: { base: "config.decisionsBaseUrl", path: "decisions" },
  });
  assert.deepEqual(evaluate.request.auth, {
    type: "bearer",
    secret: { $secret: "apiKey" },
  });
  assert.deepEqual(evaluate.request.body, {
    model: { $ref: "config.model" },
    state: { $ref: "input.state" },
    questions: { $ref: "input.questions" },
  });
  assert.deepEqual(evaluate.response.map, {
    model: { $ref: "response.model" },
    answers: { $ref: "response.answers" },
    usage: { $ref: "response.usage" },
  });
});
