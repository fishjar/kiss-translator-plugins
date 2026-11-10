const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("../../../tests/support/declarative-host.cjs");
const { load } = require("../../../tests/support/host.cjs");
const { getPluginPromptOptions, withDefaultPromptInput } = load("providers/defaultPrompts.js");

for (const handler of ["chat", "translate"]) {
  test(`DeepSeek ${handler} maps thinking modes, effort and zero temperature with the real executor`, async () => {
    const f = fixture("deepseek", "chat-completions");
    const input = handler === "chat"
      ? { messages: [{ role: "user", content: "Hello" }] }
      : { items: [{ id: "a", text: "Hello" }], targetLanguage: "zh", translationMode: "single", outputProtocol: "text" };
    assert.equal(f.config.thinkingEffort, "high");
    for (const mode of ["auto", "enabled", "disabled"]) {
      for (const effort of ["_default", "low", "high", "max"]) {
        for (const temperature of [0, 0.7]) {
          Object.assign(f.config, { thinkingMode: mode, thinkingEffort: effort, translationTemperature: temperature });
          const result = await f.invoke(handler, input);
          if (handler === "chat") assert.equal(result.text, "Hello");
          else assert.deepEqual(result, { items: [{ id: "a", text: "Hello" }] });
          const { url, init } = f.calls.at(-1), body = JSON.parse(init.body);
          assert.equal(url, "https://api.deepseek.com/chat/completions");
          assert.equal(init.headers.Authorization, "Bearer test-only-secret");
          assert.equal(body.model, f.config.model);
          if (mode === "auto") assert.ok(!Object.hasOwn(body, "thinking"));
          else assert.deepEqual(body.thinking, { type: mode });
          if (mode === "enabled" && effort !== "_default") assert.equal(body.reasoning_effort, effort);
          else assert.ok(!Object.hasOwn(body, "reasoning_effort"));
          if (handler === "translate" && mode === "disabled") assert.equal(body.temperature, temperature);
          else assert.ok(!Object.hasOwn(body, "temperature"));
        }
      }
    }
  });
}

test("DeepSeek vision defaults to plain text and sends an inline user image", async () => {
  const f = fixture("deepseek", "vision");
  const image = f.assets.put(new Blob(["png"], { type: "image/png" }));
  f.respond(() => Response.json({
    choices: [{ message: { content: "Title\nSecond line" }, finish_reason: "stop" }],
  }));

  const input = { image, mode: "doc" };
  const options = getPluginPromptOptions(f.instance, "vlm");
  assert.deepEqual(options.map(({ id }) => id), ["plain-text", "document", "table", "chart", "description"]);
  const withPrompt = withDefaultPromptInput(f.instance, "parseImage", input);
  assert.equal(withPrompt.prompt, options[0].userPrompt);
  const result = await f.invoke("parseImage", withPrompt);
  assert.deepEqual(result, {
    text: "Title\nSecond line",
    format: "markdown",
    items: [{ text: "Title", poly: null }, { text: "Second line", poly: null }],
  });
  const [{ url, init }] = f.calls;
  assert.equal(url, "https://api.deepseek.com/chat/completions");
  assert.equal(init.headers.Authorization, "Bearer test-only-secret");
  const body = JSON.parse(init.body);
  assert.equal(body.model, "deepseek-flash");
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal(Boolean(body.stream), false);
  const images = body.messages.flatMap(({ role, content }) =>
    Array.isArray(content) ? content.filter(({ type }) => type === "image_url").map((part) => ({ role, part })) : []
  );
  assert.deepEqual(images, [{
    role: "user",
    part: { type: "image_url", image_url: { url: "data:image/png;base64,cG5n" } },
  }]);
  assert.ok(body.messages.some(({ role, content }) =>
    role === "user" && Array.isArray(content) &&
    content.some(({ type, text }) => type === "text" && text === withPrompt.prompt)
  ));

  for (const { slug, userPrompt } of options.slice(1)) {
    f.instance.vlmPromptSlug = slug;
    await f.invoke("parseImage", withDefaultPromptInput(f.instance, "parseImage", input));
    const [message] = JSON.parse(f.calls.at(-1).init.body).messages;
    assert.equal(message.content.find(({ type }) => type === "text").text, userPrompt);
  }

  f.config.model = "custom-vision-model";
  const customPrompt = "Read only the label.";
  await f.invoke("parseImage", withDefaultPromptInput(f.instance, "parseImage", { ...input, prompt: customPrompt }));
  const customBody = JSON.parse(f.calls.at(-1).init.body);
  assert.equal(customBody.model, "custom-vision-model");
  assert.equal(customBody.messages[0].content.find(({ type }) => type === "text").text, customPrompt);
});

test("DeepSeek vision rejects provider errors and empty responses", async () => {
  const f = fixture("deepseek", "vision");
  const image = f.assets.put(new Blob(["png"], { type: "image/png" }));
  const input = { image, mode: "doc" };
  f.respond(() => Response.json({ error: { message: "Provider unavailable" } }, { status: 503 }));
  await assert.rejects(() => f.invoke("parseImage", input), { code: "HTTP_ERROR" });

  f.respond(() => Response.json({
    choices: [{ message: { content: " " }, finish_reason: "stop" }],
  }));
  await assert.rejects(() => f.invoke("parseImage", input), { code: "INVALID_RESPONSE" });
});
