const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("../../../tests/support/declarative-host.cjs");
const { load } = require("../../../tests/support/host.cjs");
const { getPluginPromptOptions } = load("providers/defaultPrompts.js");
const { assertPluginCompatibility } = load("providers/compatibility.js");

for (const plugin of ["index-translate", "openai-compatible-bundle"]) {
  for (const mode of ["plain-text", "image-translation", "image-bilingual"]) {
    test(`${plugin}: ${mode} uses real package, SDK, assets and structured image parser`, async () => {
      const f = fixture(plugin, "vision");
      f.instance.vlmPromptSlug = getPluginPromptOptions(f.instance, "vlm").find(
        (p) => p.id === mode,
      ).slug;
      const source = "Hello world.";
      const translation = {
        text: "你好，世界。",
        targetLanguage: "zh-CN",
        format: "text",
      };
      const content =
        mode === "plain-text"
          ? source
          : JSON.stringify({
              format: "text",
              ...(mode === "image-bilingual" ? { text: source } : {}),
              translation,
            });
      f.respond(() =>
        Response.json({
          choices: [{ message: { content }, finish_reason: "stop" }],
        }),
      );
      const image = f.assets.put(new Blob(["png"], { type: "image/png" }));
      const result = await f.invoke("parseImage", {
        image,
        targetLanguage: "zh-CN",
        glossary: { world: "世界" },
      });
      if (mode === "plain-text") assert.equal(result.text, source);
      else {
        assert.deepEqual(result.translation, translation);
        assert.equal(
          result.text,
          mode === "image-bilingual" ? source : undefined,
        );
      }
      const body = JSON.parse(f.calls[0].init.body);
      assert.equal(
        body.messages[0].content[1].image_url.url,
        "data:image/png;base64,cG5n",
      );
      if (mode !== "plain-text") {
        assert.match(
          body.messages[0].content[0].text,
          /Never put translations in text/,
        );
        assert.match(
          body.messages[0].content[0].text,
          /Target language: zh-CN/,
        );
        assert.match(body.messages[0].content[0].text, /world: 世界/);
      }
      if (plugin === "index-translate") {
        assert.equal(body.max_tokens, 4096);
        assert.equal(body.chat_template_kwargs.enable_thinking, false);
        assert.equal(body.temperature, 0);
        assert.equal(f.calls[0].init.headers.Authorization, undefined);
      }
    });
  }
}

test("Index: single-item text translation uses the host protocol and stable IDs", async () => {
  const f = fixture("index-translate", "translation");
  f.respond(() =>
    Response.json({
      choices: [{ message: { content: "你好" }, finish_reason: "stop" }],
    }),
  );
  const result = await f.invoke("translate", {
    items: [{ id: "source", text: "Hello" }],
    translationMode: "single",
    outputProtocol: "text",
    targetLanguage: "zh-CN",
  });
  assert.deepEqual(result.items, [{ id: "source", text: "你好" }]);
});

test("structured image packages load as API 2", () => {
  for (const plugin of ["index-translate", "openai-compatible-bundle"]) {
    const manifest = require(`../../${plugin}/manifest.json`);
    assert.equal(manifest.apiVersion, 2);
    assert.doesNotThrow(() => assertPluginCompatibility(manifest));
  }
});

test("Index: truncated completions never become successful parsed results", async () => {
  const f = fixture("index-translate", "vision");
  f.respond(() =>
    Response.json({
      choices: [
        { message: { content: '{"text":"Hello' }, finish_reason: "length" },
      ],
    }),
  );
  const image = f.assets.put(new Blob(["png"], { type: "image/png" }));
  await assert.rejects(f.invoke("parseImage", { image }), /incomplete/i);
});
