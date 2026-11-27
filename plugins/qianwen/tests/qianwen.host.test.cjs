const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("../../../tests/support/declarative-host.cjs");
const { load } = require("../../../tests/support/host.cjs");
const { getPluginPromptOptions, withDefaultPromptInput } = load("providers/defaultPrompts.js");

const completion = (text) => ({ choices: [{ message: { content: text }, finish_reason: "stop" }] });
const sse = (data) => new Response(data, { headers: { "content-type": "text/event-stream" } });

test("installed Qwen-MT-Uni package uses the native endpoint and host-injected credentials", async () => {
  const f = fixture("qianwen", "mt-uni");
  assert.equal(f.config.model, "qwen-mt-uni");
  f.respond(() => Response.json({
    output: { Success: true, Data: { TranslatedTexts: ["你好", "世界"] } },
  }));
  const result = await f.invoke("translate", {
    items: [{ id: "b", text: "Hello" }, { id: "a", text: "World" }],
    translationMode: "batch", targetLanguage: "zh-CN", sourceLanguage: "en",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.items)), [
    { id: "b", text: "你好" }, { id: "a", text: "世界" },
  ]);
  const [{ url, init }] = f.calls;
  assert.equal(url, "https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation");
  assert.equal(init.headers.Authorization, "Bearer test-only-secret");
  assert.deepEqual(JSON.parse(init.body), {
    model: "qwen-mt-uni", input: { source_texts: ["Hello", "World"], source_lang: "en", target_lang: "zh" },
  });
});

test("all Qianwen services retain default URLs and honor custom HTTP base paths without a key", async () => {
  for (const service of ["chat", "ocr", "omni", "asr", "mt-uni"]) {
    for (const baseUrl of [undefined, "http://192.168.6.138:8088/proxy/v1/"]) {
      const f = fixture("qianwen", service, { apiKey: "", ...(baseUrl && { baseUrl }) });
      let handler, input, suffix;
      if (service === "mt-uni") {
        handler = "translate";
        input = { items: [{ id: "a", text: "Hello" }], translationMode: "single", targetLanguage: "zh-CN" };
        suffix = "/services/aigc/multimodal-generation/generation";
        f.respond(() => Response.json({ output: { Success: true, Data: { TranslatedTexts: "你好" } } }));
      } else if (service === "asr") {
        handler = "transcribe";
        input = { audio: f.assets.put(new Blob(["wav"], { type: "audio/wav" })) };
        suffix = "/services/aigc/multimodal-generation/generation";
        f.respond(() => Response.json({ output: {
          text: "Hello", sentence: { begin_time: 0, end_time: 1000, sentence_end: true, text: "Hello" },
        } }));
      } else {
        handler = service === "chat" ? "chat" : "parseImage";
        input = service === "chat"
          ? { messages: [{ role: "user", content: "Hello" }] }
          : { image: f.assets.put(new Blob(["png"], { type: "image/png" })), mode: "doc" };
        suffix = "/chat/completions";
        if (service === "omni")
          f.respond(() => sse('data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
      }
      const result = await f.invoke(handler, input);
      if (service === "mt-uni") assert.equal(result.items[0].text, "你好");
      const expectedBase = baseUrl
        ? baseUrl.replace(/\/+$/, "")
        : "https://maas.qianwenaiapi.com/" + (["asr", "mt-uni"].includes(service) ? "api/v1" : "compatible-mode/v1");
      assert.equal(f.calls[0].url, expectedBase + suffix);
      assert.equal(f.calls[0].init.headers.Authorization, undefined);
    }
  }
});

test("Qianwen OCR and Omni send default, selected and explicit image prompts", async () => {
  for (const [id, expected] of [
    ["ocr", ["plain-text", "document", "table", "formula"]],
    ["omni", ["plain-text", "document", "table", "chart", "description"]],
  ]) {
    const f = fixture("qianwen", id, { model: "custom-" + id });
    const image = f.assets.put(new Blob(["png"], { type: "image/png" }));
    const input = { image, mode: "doc" };
    const options = getPluginPromptOptions(f.instance, "vlm");
    assert.deepEqual(options.map(({ id }) => id), expected);
    f.respond(() => id === "ocr"
      ? Response.json(completion("visible text"))
      : sse('data: {"choices":[{"delta":{"content":"visible text"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
    const verifyPrompt = async (taskInput, prompt) => {
      const args = withDefaultPromptInput(f.instance, "parseImage", taskInput);
      assert.equal((await f.invoke("parseImage", args)).text, "visible text");
      const body = JSON.parse(f.calls.at(-1).init.body);
      assert.equal(body.model, "custom-" + id);
      const [message] = body.messages;
      assert.equal(message.role, "user");
      assert.equal(message.content.find(({ type }) => type === "text").text, prompt);
    };
    await verifyPrompt(input, options[0].userPrompt);
    for (const { slug, userPrompt } of options.slice(1)) {
      f.instance.vlmPromptSlug = slug;
      await verifyPrompt(input, userPrompt);
    }
    const customPrompt = "Read only the label.";
    await verifyPrompt({ ...input, prompt: customPrompt }, customPrompt);
  }
});

test("the installed chat service sends images and maps thinking settings", async () => {
  for (const [thinkingMode, expected] of [["disabled", false], ["enabled", true], ["auto", undefined]]) {
    const chat = fixture("qianwen", "chat", { thinkingMode, model: "custom-chat" });
    chat.respond(() => Response.json(completion("visible text")));
    const asset = chat.assets.put(new Blob(["png"], { type: "image/png" }));
    const result = await chat.invoke("chat", { messages: [
      { role: "user", content: [{ type: "image", asset }, { type: "text", text: "Read it." }] },
    ] });
    const [{ url, init }] = chat.calls;
    assert.match(url, /maas\.qianwenaiapi\.com\/compatible-mode\/v1\/chat\/completions$/);
    const body = JSON.parse(init.body);
    assert.equal(body.model, "custom-chat");
    assert.equal(body.enable_thinking, expected);
    assert.equal(body.messages[0].content[0].image_url.url, "data:image/png;base64,cG5n");
    assert.equal(result.text, "visible text");
  }
});

test("Sval Omni extracts image text and rejects truncated transcriptions", async () => {
  const omni = fixture("qianwen", "omni");
  const image = omni.assets.put(new Blob(["png"], { type: "image/png" }));
  const delta = 'data: {"choices":[{"delta":{"content":"read me"}}]}\n\n';
  omni.respond(() => sse(delta + 'data: {"choices":[{"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
  const result = await omni.invoke("parseImage", { image, mode: "doc" });
  assert.equal(result.text, "read me");
  assert.equal(result.items[0].poly, null);
  const audio = omni.assets.put(new Blob(["m4a"], { type: "audio/mp4" }));
  omni.respond(() => sse(delta));
  await assert.rejects(omni.invoke("transcribeOmni", { audio }), { code: "INCOMPLETE_RESPONSE" });
});

test("Sval ASR accepts the native SSE envelope and yields aligned host words", async () => {
  const asr = fixture("qianwen", "asr", { model: "custom-asr" });
  const audio = asr.assets.put(new Blob(["wav"], { type: "audio/wav" }));
  const sentence = {
    begin_time: 240, end_time: 2480, sentence_end: true, text: "First.",
    words: [{ begin_time: 240, end_time: 2480, text: "First", punctuation: "." }],
  };
  const output = { text: "First.", sentence };
  asr.respond(() => sse("event:result\ndata:" + JSON.stringify({ output }) + "\n\n"));
  const result = await asr.invoke("transcribe", { audio, requireTimestamps: true });
  assert.equal(JSON.parse(asr.calls[0].init.body).model, "custom-asr");
  assert.equal(result.text, "First.");
  assert.equal(result.segments[0].words[0].start, 0.24);
  assert.equal(result.segments[0].words[0].text, "First.");
  asr.respond(() => Response.json({
    code: "CLIENT_ERROR", message: "ASR_RESPONSE_HAVE_NO_WORDS",
  }, { status: 400 }));
  await assert.rejects(asr.invoke("transcribe", { audio }), {
    code: "HTTP_ERROR", message: "Provider returned HTTP 400",
  });
});
