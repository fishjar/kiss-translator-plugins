const test = require("node:test");
const assert = require("node:assert/strict");
const { script, probe } = require("../../../tests/support/plugin.cjs");

const { translate } = script("qianwen", "services/mt-uni.js");
const input = {
  items: [{ id: "second", text: "Hello {{1}}" }],
  targetLanguage: "zh-CN",
  sourceLanguage: "auto",
  textFormat: "html",
};
const success = (text) => ({ output: { Success: true, Data: { TranslatedTexts: text } } });

test("Qwen-MT-Uni sends a synchronous scalar request and preserves IDs and placeholders", async () => {
  const { ctx, config } = probe();
  config.baseUrl = "https://maas.qianwenaiapi.com/api/v1/";
  ctx.http.request = async (request) => {
    assert.equal(request.url, "https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation");
    assert.equal(request.method, "POST");
    assert.equal(request.bodyType, "json");
    assert.deepEqual({ ...request.auth }, { type: "bearer", secret: { key: "apiKey" } });
    assert.equal(request.headers?.["X-DashScope-Async"], undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(request.body)), {
      model: "qwen-mt-uni", input: { source_texts: "Hello {{1}}", target_lang: "zh" },
    });
    return { body: JSON.stringify(success("你好 {{1}}")) };
  };
  assert.deepEqual(JSON.parse(JSON.stringify(await translate(input, config, ctx))), {
    items: [{ id: "second", text: "你好 {{1}}" }],
  });
});

test("Qwen-MT-Uni keeps batch shape and input order for one or several items", async () => {
  const { ctx, config } = probe();
  const items = [{ id: "b", text: "你好" }, { id: "a", text: "世界" }];
  for (const size of [1, 2]) {
    const batch = items.slice(0, size);
    const translated = ["你好", "世界"].slice(0, size);
    ctx.http.request = async ({ body }) => {
      assert.deepEqual(JSON.parse(JSON.stringify(body.input)), {
        source_texts: batch.map(({ text }) => text), source_lang: "zh", target_lang: "zh-tw",
      });
      return { body: JSON.stringify(success(translated)) };
    };
    const result = await translate({
      items: batch, translationMode: "batch", sourceLanguage: "zh-CN", targetLanguage: "zh-TW",
    }, config, ctx);
    assert.deepEqual(JSON.parse(JSON.stringify(result.items)),
      batch.map(({ id }, index) => ({ id, text: translated[index] })));
  }
});

test("Qwen-MT-Uni reports provider errors and rejects malformed results", async () => {
  const { ctx, config } = probe();
  for (const [response, expected] of [
    [{ code: "InvalidParameter", message: "Unsupported language pair", request_id: "req-1" },
      { code: "PROVIDER_ERROR", message: /InvalidParameter.*Unsupported language pair.*req-1/ }],
    [{ code: "", output: { Success: false, Code: 400, Message: "Translation failed" } },
      { code: "PROVIDER_ERROR", message: /400.*Translation failed/ }],
    [null, { code: "INVALID_RESPONSE", message: /JSON/ }],
    [success(["你好 {{1}}"]), { code: "INVALID_RESPONSE", message: /unexpected/ }],
    [success(" "), { code: "INVALID_RESPONSE", message: /empty/ }],
    [success("你好"), { code: "INVALID_RESPONSE", message: /placeholders/ }],
    [success("你好 {{1}} {{1}}"), { code: "INVALID_RESPONSE", message: /placeholders/ }],
  ]) {
    ctx.http.request = async () => ({ body: response ? JSON.stringify(response) : "<html>" });
    await assert.rejects(translate(input, config, ctx), expected);
  }
  ctx.http.request = async () => ({ body: JSON.stringify(success([])) });
  await assert.rejects(translate({ ...input, translationMode: "batch" }, config, ctx),
    { code: "INVALID_RESPONSE", message: /unexpected/ });
});

test("Qwen-MT-Uni rejects host rich-text placeholders before calling the API", async () => {
  const { ctx, config, requests } = probe();
  for (const tag of ["i", "a", "b", "x", "span"]) {
    for (const text of [`Hello <${tag}1>world</${tag}1>`, `Hello <${tag} i=1>world</${tag}>`]) {
      await assert.rejects(translate({
        ...input, items: [{ id: "a", text }],
      }, config, ctx), { code: "INVALID_INPUT", message: /Disable rich-text/ });
    }
  }
  assert.equal(requests.length, 0);
});

test("Qwen-MT-Uni maps regional aliases and preserves provider-specific language codes", async () => {
  const { ctx, config } = probe();
  for (const [locale, code] of [
    ["zh-TW", "zh-tw"], ["zh-HK", "zh-tw"], ["zh-MO", "zh-tw"],
    ["zh-Hant", "zh-tw"], ["zh-Hant-TW", "zh-tw"], ["zh_Hant_HK", "zh-tw"],
    ["zh-Hans-CN", "zh"], ["fil-PH", "tl"], ["iw-IL", "he"], ["pt-PT", "pt-pt"], ["ro_ur", "ro_ur"],
  ]) {
    ctx.http.request = async ({ body }) => {
      assert.equal(body.input.target_lang, code);
      assert.equal(body.input.source_lang, code);
      return { body: JSON.stringify(success("Hello {{1}}")) };
    };
    await translate({ ...input, sourceLanguage: locale, targetLanguage: locale }, config, ctx);
  }
});

test("Qwen-MT-Uni accepts a batch of technical text and ignores blank success codes", async () => {
  const { ctx, config } = probe();
  const texts = ["Array<string>", "Promise<void>", "std::vector<int>", "<user@example.com>"];
  const items = texts.map((text, index) => ({ id: String(index), text }));
  for (const code of ["", "  "]) {
    ctx.http.request = async ({ body }) => {
      assert.deepEqual(Array.from(body.input.source_texts), texts);
      return { body: JSON.stringify({ code, ...success(texts) }) };
    };
    const result = await translate({ ...input, items, translationMode: "batch" }, config, ctx);
    assert.deepEqual(JSON.parse(JSON.stringify(result.items)), items);
  }
});
