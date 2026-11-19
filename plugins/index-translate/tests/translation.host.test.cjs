const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("../../../tests/support/declarative-host.cjs");
const { load } = require("../../../tests/support/host.cjs");
const { getPluginPromptOptions, translationOptions } = load(
  "providers/defaultPrompts.js",
);
const { createProviderRegistry } = load("providers/registry.js");
const { upgradeServiceInstance } = load("providers/upgrade.js");
const { readProviderPackage } = load("providers/package.js");
const { buildPackage } = require("../../../scripts/build.cjs");
const path = require("node:path");
const { normalizePrompt, resolveApiPromptSettings } = load("config/prompt.js");
const manifest = require("../manifest.json");
const service = manifest.services.find((s) => s.id === "translation");
const items = [
  { id: "a-9", text: "OpenAI <b>{{user}}</b>.\nNext line | then." },
  { id: "z-2", text: "Keep the door closed." },
];
const translated = [
  { id: "a-9", text: "开放人工智能 <b>{{user}}</b>。\n下一行 | 然后。" },
  { id: "z-2", text: "请保持门关闭。" },
];
const outputs = {
  json: JSON.stringify(translated),
  xml: '<root><t id="a-9">开放人工智能 &lt;b&gt;{{user}}&lt;/b&gt;。\n下一行 | 然后。</t><t id="z-2">请保持门关闭。</t></root>',
  line: "a-9 | 开放人工智能 <b>{{user}}</b>。<br>下一行 | 然后。\nz-2 | 请保持门关闭。",
};
const response = (content, finish_reason = "stop") =>
  Response.json({
    choices: [{ message: { content }, finish_reason }],
  });

test("Index retains its default prompt ID, uses English instructions and exposes only validated tasks", () => {
  assert.equal(service.defaultPrompts.nobatch[0].id, "default");
  assert.equal(
    service.defaultPrompts.nobatch[0].userPrompt,
    "Translate the following {{from}} text into {{to}}. Return only the translation, without explanations. Preserve the source structure, HTML-like tags, code and placeholders. Follow glossary mappings exactly; an empty glossary value means preserve the source term.\nGlossary: {{glossary}}\n\nSource text:\n{{text}}",
  );
  assert.equal(service.defaultPrompts.nobatch.length, 3);
  assert.deepEqual(
    service.defaultPrompts.batch.map((p) => p.protocol),
    ["json", "xml", "line"],
  );
  assert.deepEqual(service.capabilities.translate.batch, {
    supported: true,
    maxItems: 8,
  });
  assert.deepEqual(Object.keys(service.capabilities), ["translate"]);
  assert.equal(buildPackage(path.resolve(__dirname, "..")).item.freeTier, "free");
});

test("preset copies retain protocol and text through export/import and scene selection", () => {
  const f = fixture("index-translate", "translation");
  for (const slot of ["nobatch", "batch"])
    for (const prompt of service.defaultPrompts[slot]) {
      const copy = normalizePrompt({
        ...prompt,
        slug: `copy-${slot}-${prompt.id}`,
        category: slot === "batch" ? "batch system prompt" : "user prompt",
      });
      const imported = normalizePrompt(JSON.parse(JSON.stringify(copy)));
      assert.deepEqual(imported, copy);
      assert.equal(imported.userPrompt, prompt.userPrompt);
      const api = resolveApiPromptSettings(
        { ...f.instance, scenePromptSlug: imported.slug },
        [imported],
      );
      assert.equal(translationOptions(api).outputProtocol, prompt.protocol);
      assert.equal(api.useBatchFetch, slot === "batch");
    }
});

for (const slot of ["nobatch", "batch"])
  for (const prompt of service.defaultPrompts[slot]) {
    test(`Index ${slot}/${prompt.id}: real package, prompt selection and SDK`, async () => {
      const f = fixture("index-translate", "translation");
      const batch = slot === "batch";
      f.instance.useBatchFetch = batch;
      f.instance[batch ? "batchPromptSlug" : "nobatchPromptSlug"] =
        getPluginPromptOptions(f.instance, slot).find(
          (p) => p.id === prompt.id,
        ).slug;
      const options = translationOptions(f.instance);
      assert.equal(options.outputProtocol, prompt.protocol);
      f.respond(() =>
        response(batch ? outputs[prompt.protocol] : translated[0].text),
      );
      const result = await f.invoke("translate", {
        ...options,
        items: batch ? items : items.slice(0, 1),
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
        glossary: { OpenAI: "开放人工智能" },
        document: { title: "Test guide" },
      });
      assert.deepEqual(
        result.items,
        batch ? translated : translated.slice(0, 1),
      );
      const body = JSON.parse(f.calls[0].init.body);
      assert.equal(body.stream, false);
      assert.equal(body.max_tokens, 4096);
      assert.equal(body.temperature, 0);
      assert.equal(body.chat_template_kwargs.enable_thinking, false);
      const user = body.messages.at(-1).content;
      assert.match(
        body.messages.map((m) => m.content).join("\n"),
        /开放人工智能/,
      );
      assert.match(user, /\{\{user\}\}/);
      assert.ok(!user.includes("{{text}}") && !user.includes("{{segments}}"));
      if (prompt.id !== "default" || batch) {
        assert.ok(
          prompt.userPrompt
            .trimEnd()
            .endsWith(batch ? "{{segments}}" : "{{text}}"),
        );
        assert.match(body.messages[0].content, /glossary mapping exactly/);
      }
    });
  }

for (const protocol of ["json", "xml", "line"]) {
  test(`Index ${protocol}: rejects missing/duplicate IDs, malformed and truncated responses`, async () => {
    const f = fixture("index-translate", "translation");
    const input = {
      items,
      translationMode: "batch",
      outputProtocol: protocol,
      targetLanguage: "zh-CN",
    };
    const missing = {
      json: '[{"id":"a-9","text":"译文"}]',
      xml: '<root><t id="a-9">译文</t></root>',
      line: "a-9 | 译文",
    };
    const duplicate = {
      json: '[{"id":"a-9","text":"译文"},{"id":"a-9","text":"译文"}]',
      xml: '<root><t id="a-9">译文</t><t id="a-9">译文</t></root>',
      line: "a-9 | 译文\na-9 | 译文",
    };
    for (const content of [
      missing[protocol],
      duplicate[protocol],
      "invalid response",
    ]) {
      f.respond(() => response(content));
      await assert.rejects(() => f.invoke("translate", input));
    }
    f.respond(() => response(outputs[protocol], "length"));
    await assert.rejects(() => f.invoke("translate", input), /incomplete/i);
  });
}

test("Index batch admission rejects more than eight items before executing a request", async () => {
  const f = fixture("index-translate", "translation");
  let executed = false;
  const registry = createProviderRegistry({
    resolveInstance: () => f.instance,
    createContext: () => f.ctx,
    runners: {
      script: () => {
        executed = true;
      },
    },
  });
  const call = registry.invoke(f.instance.apiSlug, "translate", {
    items: Array.from({ length: 9 }, (_, i) => ({
      id: String(i),
      text: "hello",
    })),
    translationMode: "batch",
    targetLanguage: "zh-CN",
  });
  await assert.rejects(call.result, { code: "INPUT_LIMIT_EXCEEDED" });
  assert.equal(executed, false);
  assert.equal(f.calls.length, 0);
});

test("explicit upgrade adds presets while retaining the saved selections and enabled tasks", () => {
  const pack = readProviderPackage(
    new Uint8Array(buildPackage(path.resolve(__dirname, "..")).bytes),
  );
  for (const previousVersion of ["1.0.0", "1.0.1"])
    for (const enabled of [[], ["translate"]]) {
      const f = fixture("index-translate", "translation");
      const old = f.instance;
      old.provider.source.version = previousVersion;
      old.provider.capabilities.translate.batch = { supported: false };
      old.provider.defaultPrompts.nobatch =
        old.provider.defaultPrompts.nobatch.slice(0, 1);
      delete old.provider.defaultPrompts.batch;
      old.useBatchFetch = false;
      old.batchPromptSlug = "";
      old.enabledCapabilities = enabled;
      const selected = old.nobatchPromptSlug;
      const before = JSON.stringify(old);
      const upgraded = upgradeServiceInstance(old, pack);
      assert.equal(JSON.stringify(old), before);
      assert.equal(upgraded.useBatchFetch, false);
      assert.equal(upgraded.nobatchPromptSlug, selected);
      assert.equal(upgraded.batchPromptSlug, "");
      assert.deepEqual(upgraded.enabledCapabilities, enabled);
      assert.equal(upgraded.provider.defaultPrompts.nobatch.length, 3);
      assert.equal(upgraded.provider.defaultPrompts.batch.length, 3);
      assert.equal(upgraded.provider.capabilities.translate.batch.maxItems, 8);
      assert.equal(upgraded.provider.source.version, require("../manifest.json").version);
    }
});
