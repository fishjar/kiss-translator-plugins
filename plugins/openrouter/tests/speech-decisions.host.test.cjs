const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("../../../tests/support/declarative-host.cjs");
const { load } = require("../../../tests/support/host.cjs");
const { validateInput, validateResult } = load("providers/validation.js");

for (const [service, model, voice, format] of [
  ["speech-gemini", "google/gemini-3.8-flash-tts", "Zephyr", "pcm"],
  ["speech-gemini", "google/gemini-3.8-flash-lite-tts", "Zephyr", "pcm"],
  ["speech-qwen-plus", "qwen/qwen-audio-3.0-tts-plus", "longanlingxin", "mp3"],
  ["speech-qwen-flash", "qwen/qwen-audio-3.0-tts-flash", "loongjohn", "mp3"],
])
  test(`TTS ${model} maps its voice and format and returns browser audio`, async () => {
    const f = fixture("openrouter", service, { model });
    const bytes = Uint8Array.of(0, 127, 128, 255);
    f.respond(
      () =>
        new Response(bytes, {
          headers: {
            "Content-Type":
              format === "pcm"
                ? "audio/pcm; rate=24000; channels=1"
                : "audio/mpeg",
          },
        }),
    );
    const result = await f.invoke("synthesizeSpeech", {
      text: "你好 Hello",
      speed: 1.2,
    });
    const { url, init } = f.calls[0];
    assert.equal(url, "https://openrouter.ai/api/v1/audio/speech");
    assert.equal(init.headers.Authorization, "Bearer test-only-secret");
    assert.deepEqual(JSON.parse(init.body), {
      model,
      voice,
      input: "你好 Hello",
      response_format: format,
    });
    assert.equal(
      result.mimeType,
      format === "pcm" ? "audio/wav" : "audio/mpeg",
    );
    validateResult("synthesizeSpeech", result, { text: "你好 Hello" });
    const audio = new Uint8Array(
      await f.assets.get(result.audio).arrayBuffer(),
    );
    assert.deepEqual(format === "pcm" ? audio.slice(44) : audio, bytes);
    if (format === "pcm") {
      assert.equal(Buffer.from(audio.slice(0, 4)).toString(), "RIFF");
      f.respond(
        () => new Response(audio, { headers: { "Content-Type": "audio/wav" } }),
      );
      const wav = await f.invoke("synthesizeSpeech", { text: "hello" });
      assert.deepEqual(
        new Uint8Array(await f.assets.get(wav.audio).arrayBuffer()),
        audio,
      );
    }
    f.respond(() =>
      Response.json({ error: { message: "unavailable" } }, { status: 503 }),
    );
    await assert.rejects(f.invoke("synthesizeSpeech", { text: "hello" }), {
      code: "HTTP_ERROR",
    });
  });

for (const [service, configuredVoice, overrideVoice, mime] of [
  ["speech-gemini", "Kore", "Puck", "audio/pcm"],
  ["speech-qwen-plus", "longanlingxin", "longanlufeng", "audio/mpeg"],
  ["speech-qwen-flash", "loongjohn", "longanhuan_v3.6", "audio/mpeg"],
])
  test(`${service} prefers the input voice and falls back to the configured voice`, async () => {
    const f = fixture("openrouter", service, { voice: configuredVoice });
    f.respond(
      () =>
        new Response(Uint8Array.of(0, 0), {
          headers: { "Content-Type": mime },
        }),
    );
    for (const voice of [overrideVoice, undefined]) {
      await f.invoke("synthesizeSpeech", {
        text: "Hello",
        ...(voice !== undefined && { voice }),
      });
      assert.equal(
        JSON.parse(f.calls.at(-1).init.body).voice,
        voice ?? configuredVoice,
      );
      assert.equal(f.config.voice, configuredVoice);
    }
  });

test("PCM conversion requires API 1, validates requests and counts the WAV header in asset budgets", async () => {
  const f = fixture("openrouter", "speech-gemini");
  const request = {
    url: "https://openrouter.ai/api/v1/audio/speech",
    responseType: "asset",
    responseAudio: { encoding: "pcm_s16le", sampleRate: 24000, channels: 1 },
  };
  for (const version of ["1", 2, undefined]) {
    f.instance.provider.apiVersion = version;
    await assert.rejects(f.ctx.http.request(request), {
      code: "INVALID_REQUEST",
    });
  }
  f.instance.provider.apiVersion = 1;
  await assert.rejects(
    f.ctx.http.request({ ...request, responseType: "text" }),
    { code: "INVALID_REQUEST" },
  );
  await assert.rejects(
    f.ctx.http.request({
      ...request,
      responseAudio: { ...request.responseAudio, sampleRate: 0 },
    }),
    { code: "INVALID_REQUEST" },
  );
  assert.equal(f.calls.length, 0);
  f.respond(
    () =>
      new Response(new Uint8Array(8 * 1024 * 1024), {
        headers: { "Content-Type": "audio/pcm" },
      }),
  );
  await assert.rejects(f.ctx.http.request(request), {
    code: "RESOURCE_BUDGET_EXCEEDED",
  });
  assert.equal(f.assets.entries().length, 0);
});

test("decisions pass Choice objects unchanged and preserve native answer metadata", async () => {
  const criteria = {
    English: "Text primarily in English",
    Chinese: "Text primarily in Chinese",
  };
  const input = {
    state: { text: "Hello" },
    questions: {
      language: { type: "choice", instructions: "Language?", criteria },
      positive: { type: "noul", instructions: "Positive?" },
      quality: {
        type: "score",
        instructions: "Quality?",
        criteria: ["bad", "good"],
      },
    },
  };
  const original = structuredClone(input);
  const response = {
    model: "typesafe/jev-1.14-20261014",
    answers: {
      language: {
        type: "choice",
        choice: "English",
        probabilities: { English: 1, Chinese: 0 },
        confidence: 1,
      },
      positive: { type: "noul", noul: 0.99 },
      quality: {
        type: "score",
        score: 0.98,
        confidence: 0.97,
        legend: { 0: "bad", 1: "good" },
        probabilities: { 0: 0.02, 1: 0.98 },
      },
    },
    usage: { input_tokens: 382, output_tokens: 60, cost: 0.000016044 },
  };
  const f = fixture("openrouter", "decisions");
  f.respond(() => Response.json(response));
  validateInput("evaluate", input);
  const result = await f.invoke("evaluate", input);
  validateResult("evaluate", result, input);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), response);
  assert.deepEqual(input, original);
  assert.equal(f.calls[0].url, "https://openrouter.ai/api/alpha/decisions");
  assert.equal(
    f.calls[0].init.headers.Authorization,
    "Bearer test-only-secret",
  );
  assert.deepEqual(JSON.parse(f.calls[0].init.body), {
    model: "typesafe/jev-1.14",
    state: input.state,
    questions: {
      ...input.questions,
      language: {
        ...input.questions.language,
        criteria,
      },
    },
  });
  f.respond(() =>
    Response.json({ error: { message: "unavailable" } }, { status: 503 }),
  );
  await assert.rejects(f.invoke("evaluate", input), { code: "HTTP_ERROR" });
  f.respond(() => Response.json({ error: { message: "unavailable" } }));
  await assert.rejects(f.invoke("evaluate", input), { code: "PROVIDER_ERROR" });
});

test("decision endpoints are independently configurable and cancellation propagates", async () => {
  const f = fixture("openrouter", "decisions", {
    decisionsBaseUrl: "https://decisions.invalid/custom/",
  });
  const controller = new AbortController();
  const { createTransportBroker } = load("providers/transport.js");
  const broker = createTransportBroker(f.instance, {
    assets: f.assets,
    signal: controller.signal,
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://decisions.invalid/custom/decisions");
      controller.abort();
      return Response.json({});
    },
  });
  f.ctx.http = broker.http;
  await assert.rejects(
    f.invoke("evaluate", {
      state: "hello",
      questions: { q: { type: "noul", instructions: "Hello?" } },
    }),
  );
  assert.equal(f.config.baseUrl, "https://openrouter.ai/api/v1");
});

test("the production registry rejects invalid Choice conditions before network and rejects unknown result keys", async () => {
  const f = fixture("openrouter", "decisions");
  const { createProviderRegistry } = load("providers/registry.js");
  const { runDeclarative } = load("providers/declarative.js");
  const registry = createProviderRegistry({
    resolveInstance: () => f.instance,
    createContext: () => f.ctx,
    runners: { declarative: runDeclarative },
  });
  for (const criteria of [
    ["en", "zh"],
    {},
    { "": "English" },
    { "  ": "English" },
  ]) {
    await assert.rejects(
      registry.invoke(f.instance.apiSlug, "evaluate", {
        state: "Hello",
        questions: {
          language: { type: "choice", instructions: "Language?", criteria },
        },
      }).result,
      { code: "INVALID_INPUT" },
    );
  }
  assert.equal(f.calls.length, 0);
  const input = {
    state: "Hello",
    questions: {
      language: {
        type: "choice",
        instructions: "Language?",
        criteria: { en: "English text", zh: "Chinese text" },
      },
    },
  };
  for (const choice of ["English text", "unknown", "toString", "en"]) {
    f.respond(() =>
      Response.json({
        model: "typesafe/jev-1.14",
        usage: {},
        answers: {
          language: { type: "choice", choice },
        },
      }),
    );
    const call = registry.invoke(f.instance.apiSlug, "evaluate", input);
    if (choice === "en")
      assert.equal((await call.result).answers.language.choice, "en");
    else await assert.rejects(call.result, { code: "INVALID_RESPONSE" });
  }
  f.respond(() =>
    Response.json({ model: "typesafe/jev-1.14", usage: {}, answers: {} }),
  );
  await assert.rejects(
    registry.invoke(f.instance.apiSlug, "evaluate", input).result,
    { code: "INVALID_RESPONSE" },
  );
});
