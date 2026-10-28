const test = require("node:test");
const assert = require("node:assert/strict");
const { validatePackageFiles } = require("../scripts/package-files.cjs");

test("publisher rejects encoded traversal and malformed relative URL paths", () => {
  for (const path of [
    "../speech",
    "%2e%2e/speech",
    ".%2E/speech",
    "nested/%2E%2e/speech",
    "nested\\speech",
    "\\\\other.invalid/speech",
    "audio/%5cspeech",
    "audio/\nspeech",
    "audio/%00speech",
    "audio/%7fspeech",
    "audio/%zz",
    "/speech",
    "https://other.invalid/speech",
  ]) {
    const f = fixture();
    f.rule.request.url = { $url: { base: "config.baseUrl", path } };
    assert.throws(f.check, undefined, path);
  }
  for (const path of [
    "audio/speech",
    "./audio/speech",
    "audio/speech?mode=pcm",
  ]) {
    const f = fixture();
    f.rule.request.url = { $url: { base: "config.baseUrl", path } };
    assert.doesNotThrow(f.check);
  }
});

function fixture(format = "http") {
  const reference = { $ref: "input.voice", fallbackRef: "config.voice" };
  const rule =
    format === "http"
      ? {
          request: { body: { voice: reference } },
          response: { kind: "json", map: { text: { $ref: "response.text" } } },
        }
      : {
          protocol: "openai-chat-completions",
          task: "chat",
          request: {
            baseUrl: "https://example.invalid",
            model: "test",
            auth: { type: "bearer", secret: { $secret: "apiKey" } },
            parameters: { temperature: reference },
          },
        };
  const rules = { format, handlers: { chat: rule } };
  const manifest = {
    apiVersion: 1,
    id: "api-test",
    version: "1.0.0",
    services: [
      {
        id: "chat",
        implementation: { kind: "declarative", entry: "chat.json" },
        settings: [
          { key: "voice", type: "text" },
          { key: "apiKey", type: "password" },
        ],
        capabilities: { chat: { handler: "chat" } },
      },
    ],
  };
  const check = () =>
    validatePackageFiles({
      "manifest.json": Buffer.from(JSON.stringify(manifest)),
      "chat.json": Buffer.from(JSON.stringify(rules)),
    });
  return { manifest, rules, rule, reference, check };
}

test("publisher requires numeric API 1 and rejects removed version fields", () => {
  const f = fixture();
  assert.doesNotThrow(f.check);
  for (const apiVersion of [
    undefined,
    null,
    "1",
    "2",
    "3",
    0,
    -1,
    1.5,
    2,
    3,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    f.manifest.apiVersion = apiVersion;
    assert.throws(f.check);
  }
  for (const field of ["manifestVersion", "rulesVersion"]) {
    const next = fixture();
    next.manifest[field] = 1;
    assert.throws(next.check);
  }
});

for (const format of ["http", "protocol"]) {
  test(`${format} publisher checks fallback references without a host`, () => {
    assert.doesNotThrow(fixture(format).check);
    for (const fallbackRef of [
      null,
      1,
      {},
      "response.voice",
      "config.constructor",
      "input.voice || config.voice",
      "config.apiKey",
    ]) {
      const f = fixture(format);
      f.reference.fallbackRef = fallbackRef;
      assert.throws(f.check);
    }
    for (const $ref of ["config.apiKey", "resources.voice"]) {
      const f = fixture(format);
      f.reference.$ref = $ref;
      assert.throws(f.check);
    }
    for (const change of [
      { format: undefined },
      { format: "unknown" },
      { rulesVersion: 1 },
      { manifestVersion: 1 },
    ]) {
      const f = fixture(format);
      Object.assign(f.rules, change);
      assert.throws(f.check);
    }
  });
}

test("publisher rejects response and condition fallback", () => {
  const f = fixture();
  f.rule.response.map.text.fallbackRef = "config.voice";
  assert.throws(f.check);
  const p = fixture("protocol");
  p.rule.request.parameters.temperature = {
    $if: { $ref: "config.enabled", fallbackRef: "input.voice" },
    then: 1,
  };
  assert.throws(p.check);
});
