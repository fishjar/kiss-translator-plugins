const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("../../../tests/support/declarative-host.cjs");
const { load } = require("../../../tests/support/host.cjs");
const { validateResult } = load("providers/validation.js");
const { assertPluginCompatibility } = load("providers/compatibility.js");
const manifest = require("../manifest.json");

const JOB_URL = "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs";
const RESULT_URL = "https://paddleocr-store-1.bj.bcebos.com/result.jsonl?signature=test";

function job(f, pages, resultUrl = RESULT_URL, endpoint = JOB_URL) {
  f.respond((url) => {
    if (url === endpoint) return Response.json({ code: 0, data: { jobId: "job" } });
    if (url === endpoint + "/job") {
      return Response.json({
        code: 0,
        data: { state: "done", resultUrl: { jsonUrl: resultUrl } },
      });
    }
    return new Response(pages.map((result) => JSON.stringify({ result })).join("\n"));
  });
  const image = f.assets.put(new Blob(["png"], { type: "image/png" }));
  return { image };
}

test("official package loads as API 1", () => {
  assert.equal(manifest.apiVersion, 1);
  assert.doesNotThrow(() => assertPluginCompatibility(manifest));
});

test("gateway base URL scopes both job requests and keeps BOS downloads unauthenticated", async () => {
  const f = fixture("paddleocr", "doc-parsing", {
    baseUrl: "http://gateway.example/ocr-proxy/",
  });
  const endpoint = "http://gateway.example/ocr-proxy/api/v2/ocr/jobs";
  const pages = [{ layoutParsingResults: [{ markdown: { text: "Gateway" } }] }];
  const result = await f.invoke("parseImage", job(f, pages, RESULT_URL, endpoint));
  assert.equal(result.text, "Gateway");
  assert.deepEqual(f.calls.map(({ url }) => url), [
    endpoint, endpoint + "/job", RESULT_URL,
  ]);
  assert.deepEqual(f.calls.map(({ init }) => init.headers.Authorization), [
    "Bearer test-only-secret", "Bearer test-only-secret", undefined,
  ]);
});

test("Sval, real Broker, and host validator keep all document blocks", async () => {
  const f = fixture("paddleocr", "doc-parsing");
  const input = job(f, [
    {
      layoutParsingResults: [{
        prunedResult: {
          parsing_res_list: [
            { block_label: "header", block_content: "Header" },
            {
              block_label: "text",
              block_content: "Paragraph",
              block_bbox: [1, 2, 20, 30],
            },
          ],
        },
      }],
    },
    { layoutParsingResults: [{ markdown: { text: "Fallback text" } }] },
  ]);
  const descriptor = f.instance.provider.capabilities.parseImage;
  assert.equal(descriptor.includesLayout, true);
  const result = validateResult(
    "parseImage",
    await f.invoke("parseImage", input),
    input,
    descriptor,
  );
  assert.deepEqual(result.items.map((item) => item.text), [
    "Header", "Paragraph", "Fallback text",
  ]);
  assert.equal(result.items[0].poly, null);
  assert.deepEqual(result.items[1].poly, [[1, 2], [20, 2], [20, 30], [1, 30]]);
  assert.equal(result.items[2].poly, null);
  assert.deepEqual(f.calls.map(({ init }) => init.headers.Authorization), [
    "Bearer test-only-secret", "Bearer test-only-secret", undefined,
  ]);
  assert.equal(f.calls[0].init.body.get("file").name, "image.png");
  assert.equal(f.calls[2].init.redirect, "error");
});

test("the Broker denies unfamiliar result origins and permits an explicit HTTPS endpoint", async () => {
  const fileUrl = "https://other.example/result.jsonl?signature=test";
  const denied = fixture("paddleocr", "doc-parsing");
  await assert.rejects(denied.invoke("parseImage", job(denied, [], fileUrl)), {
    code: "NETWORK_DENIED",
  });
  assert.equal(denied.calls.length, 2);

  const allowed = fixture("paddleocr", "doc-parsing", {
    resultOrigin: "https://other.example",
  });
  const pages = [{ layoutParsingResults: [{ markdown: { text: "Allowed" } }] }];
  const result = await allowed.invoke("parseImage", job(allowed, pages, fileUrl));
  assert.equal(result.text, "Allowed");
  assert.equal(allowed.calls[2].init.headers.Authorization, undefined);
});
