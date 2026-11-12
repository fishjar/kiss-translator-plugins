const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

for (const plugin of [
  "deepseek",
  "openai-compatible-bundle",
  "openrouter",
  "qianwen",
  "siliconflow",
  "kimi",
]) {
  test(`${plugin}: official text presets declare the optional inputs they use`, () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../plugins", plugin, "manifest.json"),
        "utf8",
      ),
    );
    const services = manifest.services.filter((s) => s.capabilities.dictionary);
    const expected = {
      batch: [
        "segments",
        "to",
        "tone",
        "glossary",
        "title",
        "description",
        "summary",
        "context",
      ],
      nobatch: [
        "text",
        "to",
        "tone",
        "glossary",
        "title",
        "description",
        "summary",
        "context",
      ],
      dictionary: [
        "text",
        "language",
        "sourceLanguage",
        "glossary",
        "title",
        "description",
        "summary",
        "context",
      ],
      subtitle: ["to", "tone", "glossary", "title", "description", "summary"],
    };
    for (const service of services)
      for (const [slot, names] of Object.entries(expected)) {
        for (const prompt of service.defaultPrompts[slot]) {
          const text =
            (prompt.systemPrompt || "") + "\n" + (prompt.userPrompt || "");
          for (const name of names)
            assert.ok(text.includes(`{{${name}}}`), `${slot}: ${name}`);
        }
      }
  });
}

test("all official service templates use supported placeholders and matching translation protocols", () => {
  const supported = new Set([
    "text",
    "transcript",
    "items",
    "segments",
    "title",
    "description",
    "summary",
    "context",
    "tone",
    "glossary",
    "to",
    "from",
    "toLang",
    "fromLang",
    "language",
    "sourceLanguage",
    "targetLanguage",
    "url",
  ]);
  for (const plugin of fs.readdirSync(path.join(__dirname, "../plugins"))) {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../plugins", plugin, "manifest.json"),
        "utf8",
      ),
    );
    for (const service of manifest.services)
      for (const [slot, prompts] of Object.entries(
        service.defaultPrompts || {},
      ))
        for (const prompt of prompts) {
          const text = [prompt.systemPrompt, prompt.userPrompt].join("\n");
          for (const match of text.matchAll(/\{\{(\w+)\}\}/g))
            assert.ok(
              supported.has(match[1]),
              `${plugin}/${service.id}/${slot}: ${match[1]}`,
            );
          if (slot === "batch") {
            assert.ok(
              ["json", "line", "xml"].includes(prompt.protocol || "json"),
            );
            assert.ok(
              text.includes("{{segments}}") || text.includes("{{items}}"),
            );
          }
          if (slot === "nobatch") {
            assert.equal(prompt.protocol || "text", "text");
            assert.ok(text.includes("{{text}}"));
          }
          if (slot === "dictionary") assert.ok(text.includes("{{text}}"));
        }
  }
});
