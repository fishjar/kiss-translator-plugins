const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("../../../tests/support/declarative-host.cjs");

test("speech maps voice, speed and text to a real request and returns an audio asset", async () => {
  const f = fixture("openai-compatible-bundle", "speech");
  const bytes = Uint8Array.of(0, 127, 128, 255);
  f.respond(() => new Response(bytes, { headers: { "Content-Type": "audio/mpeg" } }));
  for (const speed of [undefined, 1.25]) {
    const result = await f.invoke("synthesizeSpeech", { text: "Hello", ...(speed !== undefined && { speed }) });
    const { url, init } = f.calls.at(-1);
    assert.equal(url, "https://api.openai.com/v1/audio/speech");
    assert.equal(init.headers.Authorization, "Bearer test-only-secret");
    assert.deepEqual(JSON.parse(init.body), {
      model: f.config.model, voice: f.config.voice, input: "Hello", response_format: "mp3",
      ...(speed !== undefined && { speed }),
    });
    assert.equal(result.mimeType, "audio/mpeg");
    assert.equal(result.audio.mimeType, "audio/mpeg");
    assert.deepEqual(new Uint8Array(await f.assets.get(result.audio).arrayBuffer()), bytes);
  }
});

test("speech uses input voice before the saved configuration without mutating it", async () => {
  const f = fixture("openai-compatible-bundle", "speech", { voice: "alloy" });
  f.respond(
    () =>
      new Response(Uint8Array.of(0, 0), {
        headers: { "Content-Type": "audio/mpeg" },
      }),
  );
  for (const voice of ["nova", undefined]) {
    await f.invoke("synthesizeSpeech", {
      text: "Hello",
      ...(voice !== undefined && { voice }),
    });
    assert.equal(JSON.parse(f.calls.at(-1).init.body).voice, voice ?? "alloy");
    assert.equal(f.config.voice, "alloy");
  }
});

test("transcription sends binary multipart, maps language and returns the response text", async () => {
  const f = fixture("openai-compatible-bundle", "transcriptions");
  const bytes = Uint8Array.of(0, 127, 128, 255);
  const audio = f.assets.put(new Blob([bytes], { type: "audio/wav" }));
  f.respond(() => Response.json({ text: "你好" }));
  for (const language of [undefined, "", "auto", "zh-CN"]) {
    assert.deepEqual(await f.invoke("transcribe", { audio, ...(language !== undefined && { language }) }), { text: "你好" });
    const { url, init } = f.calls.at(-1);
    assert.equal(url, "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(init.headers.Authorization, "Bearer test-only-secret");
    assert.ok(init.body instanceof FormData);
    assert.equal(init.body.get("model"), f.config.model);
    assert.equal(init.body.get("response_format"), "json");
    assert.deepEqual([...new Uint8Array(await init.body.get("file").arrayBuffer())], [...bytes]);
    assert.equal(init.body.get("file").type, "audio/wav");
    if (language === "zh-CN") assert.equal(init.body.get("language"), "zh");
    else assert.ok(!init.body.has("language"));
    assert.ok(!Object.keys(init.headers).some((key) => key.toLowerCase() === "content-type"));
  }
  f.respond(() => Response.json({ error: { message: "unavailable" } }));
  await assert.rejects(f.invoke("transcribe", { audio }), { code: "PROVIDER_ERROR" });
});
