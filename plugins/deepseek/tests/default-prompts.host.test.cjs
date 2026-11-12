const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("../../../tests/support/declarative-host.cjs");
const { load } = require("../../../tests/support/host.cjs");
const { withDefaultPromptInput } = load("providers/defaultPrompts.js");
const { buildMessages } = load("providers/sdk/translation.js");
const { applyTestPrompt } = load("providers/testInput.js");
const { resolveApiPromptSettings } = load("config/prompt.js");

for (const [plugin, service] of [
  ["deepseek", "chat-completions"],
  ["openai-compatible-bundle", "chat-completions"],
  ["openrouter", "chat-completions"],
  ["qianwen", "chat"],
  ["siliconflow", "chat-completions"],
  ["kimi", "kimi-code"],
  ["kimi", "open-platform"],
]) {
  test(`${plugin}/${service}: system-only content is not supplemented`, async () => {
    const f = fixture(plugin, service);
    const input = {
      text: "bank {{tone}} $$ $&",
      language: "zh",
      instructions: "{{text}}",
      glossary: { bank: "河岸" },
      tone: "formal",
    };
    await f.invoke(
      "dictionary",
      withDefaultPromptInput(f.instance, "dictionary", input),
    );
    const messages = JSON.parse(f.calls.at(-1).init.body).messages;
    assert.equal(messages[0].content, input.text);
    assert.equal(
      messages.some((m) => m.role === "user"),
      false,
    );
    const count = f.calls.length;
    await f.invoke("dictionary", withDefaultPromptInput(f.instance, "dictionary", { ...input, instructions: null }));
    assert.equal(f.calls.length, count + 1);
    assert.ok(JSON.stringify(JSON.parse(f.calls.at(-1).init.body).messages).includes("bank"));
    const afterDefault = f.calls.length;
    await assert.rejects(f.invoke("dictionary", { ...input, instructions: "{{context}}", userPrompt: "" }), { code: "INVALID_INPUT" });
    assert.equal(f.calls.length, afterDefault);
    f.respond(() =>
      Response.json({
        choices: [
          {
            message: { content: '[{"id":"a","text":"河岸"}]' },
            finish_reason: "stop",
          },
        ],
      }),
    );
    await f.invoke(
      "translate",
      withDefaultPromptInput(f.instance, "translate", {
        items: [{ id: "a", text: "bank" }],
        targetLanguage: "zh",
        translationMode: "batch",
        outputProtocol: "json",
        systemPrompt: "{{segments}}",
      }),
    );
    const translated = JSON.parse(f.calls.at(-1).init.body).messages;
    assert.equal(translated[0].content, '[{"id":"a","text":"bank"}]');
    assert.equal(
      translated.some((m) => m.role === "user"),
      false,
    );
  });
  test(`${plugin}/${service}: explicit default dictionary glossary reaches the production request`, async () => {
    const f = fixture(plugin, service);
    const input = {
      text: "bank",
      sourceLanguage: "en",
      language: "zh",
      glossary: { bank: "河岸" },
    };
    await f.invoke(
      "dictionary",
      applyTestPrompt(
        "dictionary",
        input,
        resolveApiPromptSettings(f.instance),
      ),
    );
    let messages = JSON.parse(f.calls.at(-1).init.body).messages;
    assert.match(messages[1].content, /- bank: 河岸/);
    assert.ok(!JSON.stringify(messages).includes("{{glossary}}"));
    await f.invoke(
      "dictionary",
      withDefaultPromptInput(f.instance, "dictionary", {
        ...input,
        instructions: "Define",
        userPrompt: "{{text}}",
      }),
    );
    messages = JSON.parse(f.calls.at(-1).init.body).messages;
    assert.deepEqual(messages, [
      { role: "system", content: "Define" },
      { role: "user", content: "bank" },
    ]);

    for (const slot of ["batch", "nobatch"]) {
      const prompt = f.instance.provider.defaultPrompts[slot][0];
      const translated = buildMessages({
        ...prompt,
        items: [{ id: "a", text: "bank" }],
        targetLanguage: "zh",
        translationMode: slot === "batch" ? "batch" : "single",
        outputProtocol: prompt.protocol,
        tone: "formal",
        glossary: input.glossary,
        document: { title: "River guide" },
        context: "Near water",
      });
      const content = translated.map((m) => m.content).join("\n");
      for (const value of ["formal", "河岸", "River guide", "Near water"])
        assert.ok(content.includes(value));
    }
    const subtitle = withDefaultPromptInput(f.instance, "segmentSubtitle", {
      items: [{ id: "a", text: "bank" }],
      targetLanguage: "zh",
      tone: "formal",
      glossary: input.glossary,
      document: {
        title: "River guide",
        description: "Description",
        summary: "Summary",
      },
    });
    f.respond(() =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                groups: [{ ids: ["a"], text: "bank", translation: "河岸" }],
              }),
            },
            finish_reason: "stop",
          },
        ],
      }),
    );
    await f.invoke("segmentSubtitle", subtitle);
    const content = JSON.parse(f.calls.at(-1).init.body).messages[0].content;
    for (const value of [
      "formal",
      "河岸",
      "River guide",
      "Description",
      "Summary",
    ])
      assert.ok(content.includes(value));
  });
}
