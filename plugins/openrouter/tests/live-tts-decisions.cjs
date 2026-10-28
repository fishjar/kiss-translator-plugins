// Explicit opt-in: OPENROUTER_API_KEY is read only from the process environment.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const fixture = require("../../../tests/support/declarative-host.cjs");
const { load } = require("../../../tests/support/host.cjs");
const { validateInput, validateResult } = load("providers/validation.js");

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || !process.argv[2])
    throw new Error("Set OPENROUTER_API_KEY and provide an output directory.");
  const output = path.resolve(process.argv[2]);
  fs.mkdirSync(output, { recursive: true });
  const report = [];
  for (const [service, model] of [
    ["speech-gemini", "google/gemini-3.8-flash-tts"],
    ["speech-gemini", "google/gemini-3.8-flash-lite-tts"],
    ["speech-qwen-plus", "qwen/qwen-audio-3.0-tts-plus"],
    ["speech-qwen-flash", "qwen/qwen-audio-3.0-tts-flash"],
    ["decisions", "typesafe/jev-1.14"],
  ]) {
    const f = fixture("openrouter", service, { apiKey, model });
    let status, contentType;
    f.respond(async (url, init) => {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(90000),
      });
      status = response.status;
      contentType = response.headers.get("content-type");
      return response;
    });
    const start = Date.now();
    if (service === "decisions") {
      const criteria = {
        English: "Text primarily in English",
        Chinese: "Text primarily in Chinese",
      };
      const input = {
        state: {
          text: "Hello world. The translation service is working correctly.",
        },
        questions: {
          language: {
            type: "choice",
            instructions: "Which language is the text written in?",
            criteria,
          },
          positive: {
            type: "noul",
            instructions: "Does the text say the service is working correctly?",
          },
          quality: {
            type: "score",
            instructions: "How positive is the statement?",
            criteria: ["negative", "neutral", "positive"],
          },
        },
      };
      validateInput("evaluate", input);
      const result = await f.invoke("evaluate", input);
      validateResult("evaluate", result, input);
      assert.equal(result.answers.language.choice, "English");
      assert.ok(result.answers.positive.noul > 0.5);
      assert.ok(result.answers.quality.score > 1.5);
      report.push({
        model,
        criteria: "object",
        status,
        result,
      });
    } else {
      const input = { text: "Hello. 你好，这是语音合成测试。" };
      const result = await f.invoke("synthesizeSpeech", input);
      validateResult("synthesizeSpeech", result, input);
      const bytes = Buffer.from(await f.assets.get(result.audio).arrayBuffer());
      assert.ok(bytes.length > 1000);
      const pcm = service === "speech-gemini";
      assert.equal(result.mimeType, pcm ? "audio/wav" : "audio/mpeg");
      if (pcm) {
        assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
        assert.equal(bytes.readUInt32LE(24), 24000);
        assert.equal(bytes.readUInt16LE(22), 1);
      }
      const file = model.replace("/", "-") + (pcm ? ".wav" : ".mp3");
      fs.writeFileSync(path.join(output, file), bytes);
      report.push({
        model,
        status,
        contentType,
        mimeType: result.mimeType,
        bytes: bytes.length,
        file,
        elapsedMs: Date.now() - start,
      });
    }
    f.assets.clear();
  }
  fs.writeFileSync(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify({ output, report }, null, 2));
}
main().catch((error) => {
  console.error(
    error.code || "LIVE_TEST_FAILED",
    "Live acceptance failed; no credentials or request headers logged.",
  );
  process.exitCode = 1;
});
