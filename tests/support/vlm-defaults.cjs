const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("./declarative-host.cjs");
const { load } = require("./host.cjs");
const { getPluginPromptOptions } = load("providers/defaultPrompts.js");

module.exports = function testVlmDefaults(plugin, service) {
  test(`${plugin}/${service}: plain paragraphs default, Markdown selection and custom prompts reach the provider`, async () => {
    const f = fixture(plugin, service);
    const options = getPluginPromptOptions(f.instance, "vlm");
    assert.equal(options[0].id, "plain-text");
    const document = options.find((prompt) => prompt.id === "document");
    for (const prompt of [options[0], document]) {
      assert.match(prompt.userPrompt, /merge visual line wraps/);
      assert.match(prompt.userPrompt, /genuinely distinct paragraphs with a blank line/);
      assert.match(prompt.userPrompt, /headings, lists, tables, code, and poetry/);
      assert.match(prompt.userPrompt, /Do not translate, summarize, rewrite, or invent/);
    }
    assert.match(options[0].userPrompt, /plain text paragraphs, without adding Markdown/);
    assert.match(document.userPrompt, /content in Markdown/);
    const text = "First paragraph.\n\nSecond paragraph.\n- List item";
    f.respond(() => service === "omni"
      ? new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`, {
          headers: { "Content-Type": "text/event-stream" },
        })
      : Response.json({ choices: [{ message: { content: text }, finish_reason: "stop" }] }));
    const image = f.assets.put(new Blob(["png"], { type: "image/png" }));
    const invoke = async (input, expected) => {
      const result = await f.invoke("parseImage", { image, ...input });
      assert.equal(result.text, text);
      const body = JSON.parse(f.calls.at(-1).init.body);
      const content = body.messages[0].content;
      assert.equal(content.find((part) => part.type === "text").text, expected);
      assert.equal(content.find((part) => part.type === "image_url").image_url.url, "data:image/png;base64,cG5n");
    };
    await invoke({}, options[0].userPrompt);
    f.instance.vlmPromptSlug = document.slug;
    await invoke({}, document.userPrompt);
    await invoke({ prompt: "Read only the title." }, "Read only the title.");
    const table = options.find((prompt) => prompt.id === "table");
    f.instance.vlmPromptSlug = table.slug;
    await invoke({}, table.userPrompt);
  });
};
