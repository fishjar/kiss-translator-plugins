const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Sval = require("../../../tests/support/host.cjs").hostRequire("sval");
const { load } = require("../../../tests/support/host.cjs");
const { validateDeclarativeRules } = load("providers/declarativeRules.js");
const { providerHelpers } = load("providers/sdk/index.js");
const defaults = load("providers/sdk/defaultTextTaskPrompts.json");
const translation = load("providers/sdk/defaultTranslationPrompts.json");
const { TRANSLATION_PROTOCOL_PROMPTS } = load("providers/sdk/translation.js");
const root = path.resolve(__dirname, "../../..");
const guide = fs.readFileSync(
  path.join(root, "docs/plugin-development-guide.md"),
  "utf8",
);

test("Plugin API 1 declarative documentation uses installable protocol/task combinations", () => {
  const example = JSON.parse(
    guide.match(/<!-- api1-example -->\s*```json\s*([\s\S]*?)```/)[1],
  );
  validateDeclarativeRules(example.rules, example.capabilities, [
    { key: "apiKey", type: "password" },
  ]);
  for (const task of ["summarize", "transcribe", "synthesizeSpeech"])
    assert.equal(example.rules.handlers[task].task, task);
});

test("Plugin API 1 script documentation runs through the real interpreter and helpers", async () => {
  const code = guide.match(
    /<!-- api1-script-example -->\s*```javascript\s*([\s\S]*?)```/,
  )[1];
  const interpreter = new Sval({ ecmaVer: "latest", sandBox: true });
  interpreter.run(code);
  let request;
  const result = await interpreter.exports.summarize(
    { text: "A river geography article", language: "zh" },
    { model: "test", baseUrl: "https://example.invalid/v1" },
    {
      helpers: providerHelpers,
      secrets: { ref: (key) => ({ key }) },
      http: {
        request: async (value) => {
          request = value;
          return {
            status: 200,
            body: {
              choices: [
                { message: { content: "河流摘要" }, finish_reason: "stop" },
              ],
            },
          };
        },
      },
    },
  );
  assert.deepEqual(result, { text: "河流摘要" });
  assert.equal(request.body.stream, false);
  assert.ok(
    request.body.messages.some((message) =>
      message.content.includes("A river geography article"),
    ),
  );
});

for (const id of [
  "deepseek",
  "openai-compatible-bundle",
  "openrouter",
  "siliconflow",
]) {
  test(`${id}: published prompt previews and SDK defaults agree`, () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, "plugins", id, "manifest.json")),
    );
    assert.equal(manifest.apiVersion, 1);
    assert.equal(Object.hasOwn(manifest, "minHostVersion"), false);
    const prompts = manifest.services.find(
      (service) => service.id === "chat-completions",
    ).defaultPrompts;
    assert.deepEqual(prompts.batch, { protocol: "json", ...translation });
    assert.deepEqual(prompts.nobatch, {
      protocol: "text",
      ...TRANSLATION_PROTOCOL_PROMPTS.text,
    });
    assert.deepEqual(prompts.dictionary, defaults.dictionary);
    assert.deepEqual(prompts.subtitle, defaults.subtitle);
    assert.ok(
      !/"[eot]"\s*:|previous "e"|current "e"/.test(
        prompts.subtitle.systemPrompt,
      ),
    );
    assert.match(prompts.dictionary.systemPrompt, /Pure translation mode/);
    assert.match(prompts.subtitle.systemPrompt, /15 words/);
  });
}
