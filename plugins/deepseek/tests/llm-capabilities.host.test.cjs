const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("../../../tests/support/declarative-host.cjs");
const { load } = require("../../../tests/support/host.cjs");
const { withDefaultPromptInput } = load("providers/defaultPrompts.js");

for (const plugin of [
  "deepseek",
  "openai-compatible-bundle",
  "openrouter",
  "siliconflow",
]) {
  test(`${plugin}: four LLM capabilities, default prompts and complete results use production runtime`, async () => {
    const f = fixture(plugin, "chat-completions");
    for (const capability of [
      "chat",
      "translate",
      "dictionary",
      "segmentSubtitle",
    ])
      assert.ok(f.instance.provider.capabilities[capability]);
    const input = withDefaultPromptInput(f.instance, "dictionary", {
      text: "bank",
      sourceLanguage: "en",
      language: "zh",
      context: "river",
    });
    f.respond(() =>
      Response.json({
        choices: [
          { message: { content: "# bank\nRiver bank" }, finish_reason: "stop" },
        ],
      }),
    );
    assert.deepEqual(await f.invoke("dictionary", input), {
      text: "# bank\nRiver bank",
      format: "markdown",
    });
    let body = JSON.parse(f.calls.at(-1).init.body);
    assert.match(body.messages[1].content, /bank/);
    assert.match(body.messages[0].content, /zh/);
    assert.match(body.messages[1].content, /river/);
    assert.ok(!body.messages[0].content.includes("{{"));
    const custom = withDefaultPromptInput(f.instance, "dictionary", {
      text: "bank",
      language: "ja",
      instructions: "Explain {{text}} in {{language}}",
      userPrompt: "Word {{text}}",
    });
    await f.invoke("dictionary", custom);
    body = JSON.parse(f.calls.at(-1).init.body);
    assert.deepEqual(body.messages, [
      { role: "system", content: "Explain bank in ja" },
      { role: "user", content: "Word bank" },
    ]);
    const subtitle = withDefaultPromptInput(f.instance, "segmentSubtitle", {
      items: [
        { id: "a", text: "Hello", start: 0, end: 1 },
        { id: "b", text: "world", start: 1, end: 2 },
      ],
      targetLanguage: "zh",
    });
    const groups = [
      { ids: ["a", "b"], text: "Hello world", translation: "你好" },
    ];
    f.respond(() =>
      Response.json({
        choices: [
          {
            message: { content: JSON.stringify({ groups }) },
            finish_reason: "stop",
          },
        ],
      }),
    );
    assert.deepEqual(await f.invoke("segmentSubtitle", subtitle), { groups });
    body = JSON.parse(f.calls.at(-1).init.body);
    assert.deepEqual(JSON.parse(body.messages[1].content), subtitle.items);
    for (const ids of [["b", "a"], ["a"], ["a", "a"], ["a", "c"]]) {
      f.respond(() =>
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({ groups: [{ ...groups[0], ids }] }),
              },
              finish_reason: "stop",
            },
          ],
        }),
      );
      await assert.rejects(f.invoke("segmentSubtitle", subtitle), {
        code: "INVALID_RESPONSE",
      });
    }
    f.ctx.options.streaming = true;
    await assert.rejects(f.invoke("segmentSubtitle", subtitle));
  });

  test(`${plugin}: dictionary streaming emits deltas and rejects truncation`, async () => {
    const f = fixture(plugin, "chat-completions");
    f.ctx.options.streaming = true;
    const emitted = [];
    f.ctx.emit = async (event) => emitted.push(event);
    const input = withDefaultPromptInput(f.instance, "dictionary", {
      text: "bank",
      language: "zh",
    });
    const frames = [
      JSON.stringify({
        choices: [{ delta: { content: "# bank" }, finish_reason: null }],
      }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
      "[DONE]",
    ];
    const respond = (list) =>
      f.respond(
        () =>
          new Response(list.map((data) => `data: ${data}\n\n`).join(""), {
            headers: { "Content-Type": "text/event-stream" },
          }),
      );
    respond(frames);
    assert.deepEqual(await f.invoke("dictionary", input), {
      text: "# bank",
      format: "markdown",
    });
    assert.ok(
      emitted.some(
        (event) => event.type === "text.delta" && event.text === "# bank",
      ),
    );
    respond(frames.slice(0, 1));
    await assert.rejects(f.invoke("dictionary", input));
  });
}
