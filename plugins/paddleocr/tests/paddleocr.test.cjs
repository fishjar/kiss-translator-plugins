const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const handlers = require("../services/paddleocr.js");
const manifest = require("../manifest.json");

const IMAGE = { assetId: "asset-1", mimeType: "image/png" };
const JSON_URL = "https://paddleocr.bj.bcebos.com/result.jsonl";

test("invalid base addresses never send credentials", async () => {
  for (const baseUrl of [
    "ftp://gateway.example",
    "https://user:password@gateway.example",
    "https://gateway.example?token=test",
    "https://gateway.example/path#fragment",
  ]) {
    const { ctx, calls } = createContext([]);
    await assert.rejects(handlers.recognizeText({ image: IMAGE }, { baseUrl }, ctx), {
      code: "INVALID_CONFIG",
    });
    assert.equal(calls.length, 0);
  }
});

function response(body) {
  return { status: 200, headers: {}, body: body };
}

// 用顺序化的假 HTTP 响应替代真实网络，检查请求描述符与解析结果。
function createContext(steps) {
  const calls = [];
  const ctx = {
    secrets: { ref: (key) => ({ scope: "service", key: key }) },
    emit: async (event) => {
      calls.push({ emit: event });
    },
    http: {
      async request(request) {
        calls.push({ request: request });
        const step = steps.shift();
        if (!step) throw new Error("unexpected request: " + request.url);
        return step(request);
      },
    },
  };
  return { ctx: ctx, calls: calls };
}

const OCR_PAGE = {
  ocrResults: [
    {
      prunedResult: {
        rec_texts: ["Hello", "World"],
        rec_scores: [0.99, 0.8],
        rec_polys: [
          [
            [0, 0],
            [10, 0],
            [10, 5],
            [0, 5],
          ],
          [
            [0, 10],
            [10, 10],
            [10, 15],
            [0, 15],
          ],
        ],
      },
    },
  ],
};

test("recognizeText submits a job, polls and parses OCR lines", async () => {
  const { ctx, calls } = createContext([
    () => response(JSON.stringify({ code: 0, data: { jobId: "job-1" } })),
    () =>
      response(
        JSON.stringify({
          code: 0,
          data: { state: "done", resultUrl: { jsonUrl: JSON_URL } },
        })
      ),
    () => response(JSON.stringify({ result: OCR_PAGE })),
  ]);

  const result = await handlers.recognizeText({ image: IMAGE }, {}, ctx);
  const requests = calls
    .filter((call) => call.request)
    .map((call) => call.request);

  assert.equal(result.format, "text");
  assert.equal(result.text, "Hello\nWorld");
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items[0].poly, [
    [0, 0],
    [10, 0],
    [10, 5],
    [0, 5],
  ]);
  assert.equal(result.items[0].confidence, 0.99);

  const submit = requests[0];
  assert.equal(submit.method, "POST");
  assert.equal(submit.bodyType, "multipart");
  assert.equal(submit.body.model, "PP-OCRv6");
  assert.equal(submit.body.file.filename, "image.png");
  assert.deepEqual(JSON.parse(submit.body.optionalPayload), {
    useDocOrientationClassify: false,
    useDocUnwarping: false,
    useTextlineOrientation: false,
  });

  // 结果链接是 BOS 预签名地址，不能附加 Authorization。
  assert.equal(requests[2].url, JSON_URL);
  assert.equal(requests[2].auth, undefined);
});

test("parseImage keeps layout blocks, headers and Markdown fallback pages", async () => {
  const docPage = {
    layoutParsingResults: [
      {
        prunedResult: {
          parsing_res_list: [
            {
              block_label: "doc_title",
              block_content: "# 标题",
              block_bbox: [1, 2, 30, 40],
            },
            // 没有 block_bbox 的块仍要参与翻译。
            { block_label: "header", block_content: "页眉 2026" },
            {
              block_label: "image",
              block_content:
                '<div style="text-align: center;"><img src="imgs/a.jpg" alt="Image" width="39%" /></div>',
              block_bbox: [10, 10, 50, 50],
            },
            {
              block_label: "table",
              block_content:
                "<table><tr><td>姓名</td><td>张&amp;三</td></tr></table>",
              block_bbox: [2, 60, 90, 80],
            },
            {
              block_label: "display_formula",
              block_content: "$$x^2 + y^2 = z^2$$",
              block_bbox: [null, 85, 90, 95],
            },
          ],
        },
      },
    ],
  };
  const fallbackPage = {
    layoutParsingResults: [
      { markdown: { text: "第二页 Markdown\n\n| A | B |\n| - | - |" } },
    ],
  };
  const { ctx, calls } = createContext([
    () => response(JSON.stringify({ code: 0, data: { jobId: "job-2" } })),
    () =>
      response(
        JSON.stringify({
          code: 0,
          data: { state: "done", resultUrl: { jsonUrl: JSON_URL } },
        })
      ),
    () =>
      response(
        [docPage, fallbackPage]
          .map((page) => JSON.stringify({ result: page }))
          .join("\r\n")
      ),
  ]);

  const result = await handlers.parseImage(
    { image: IMAGE },
    { model: "PaddleOCR-VL-1.6" },
    ctx
  );

  assert.equal(result.format, "markdown");
  assert.equal(
    result.text,
    "# 标题\n\n页眉 2026\n\n<table><tr><td>姓名</td><td>张&amp;三</td></tr></table>\n\n$$x^2 + y^2 = z^2$$\n\n第二页 Markdown\n\n| A | B |\n| - | - |"
  );
  assert.deepEqual(result.items, [
    {
      text: "# 标题",
      type: "doc_title",
      poly: [
        [1, 2],
        [30, 2],
        [30, 40],
        [1, 40],
      ],
    },
    { text: "页眉 2026", type: "header", poly: null },
    {
      text: "<table><tr><td>姓名</td><td>张&amp;三</td></tr></table>",
      type: "table",
      poly: [[2, 60], [90, 60], [90, 80], [2, 80]],
    },
    { text: "$$x^2 + y^2 = z^2$$", type: "display_formula", poly: null },
    { text: "第二页 Markdown\n\n| A | B |\n| - | - |", poly: null },
  ]);

  const payload = JSON.parse(calls[0].request.body.optionalPayload);
  assert.equal(calls[0].request.body.model, "PaddleOCR-VL-1.6");
  assert.equal(payload.useLayoutDetection, true);
  assert.equal(payload.returnMarkdownImages, false);
  assert.equal(payload.useTextlineOrientation, undefined);
});

test("an unavailable model is rejected before submitting a job", async () => {
  const { ctx, calls } = createContext([]);
  await assert.rejects(
    handlers.parseImage(
      { image: IMAGE },
      { model: "PaddleOCR-VL" },
      ctx
    ),
    { code: "INVALID_CONFIG" }
  );
  assert.equal(calls.length, 0);
});

for (const [index, capability, expected] of [
  [0, "recognizeText", ["PP-OCRv6", "PP-OCRv5", "PP-OCRv5-latin"]],
  [1, "parseImage", ["PaddleOCR-VL-1.6", "PaddleOCR-VL-1.5", "PP-StructureV3"]],
]) {
  test(`${capability} submits exactly the models shown in its select field`, async () => {
    const modelField = manifest.services[index].settings.find((field) => field.key === "model");
    assert.equal(modelField.type, "select");
    assert.deepEqual(modelField.options.map((option) => option.value), expected);
    for (const model of expected) {
      const marker = new Error("stop after submission");
      const { ctx, calls } = createContext([() => { throw marker; }]);
      await assert.rejects(handlers[capability]({ image: IMAGE }, { model }, ctx), marker);
      assert.equal(calls[0].request.body.model, model);
    }
  });
}

function handlersWithoutTimers(AbortSignal) {
  const exports = {};
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../services/paddleocr.js"), "utf8"),
    { exports, AbortSignal }
  );
  return exports;
}

test("the API 1 timer fallback waits between polls and enforces the overall deadline", async () => {
  const delays = [];
  const { recognizeText } = handlersWithoutTimers({
    timeout(ms) {
      const controller = new AbortController();
      delays.push({ ms, controller });
      if (ms < 100000) queueMicrotask(() => controller.abort());
      return controller.signal;
    },
  });
  const { ctx } = createContext([
    () => response(JSON.stringify({ code: 0, data: { jobId: "legacy" } })),
    () => response(JSON.stringify({ code: 0, data: { state: "pending" } })),
    () => response(JSON.stringify({
      code: 0,
      data: { state: "done", resultUrl: { jsonUrl: JSON_URL } },
    })),
    () => response(JSON.stringify({ result: OCR_PAGE })),
  ]);
  assert.equal((await recognizeText({ image: IMAGE }, {}, ctx)).text, "Hello\nWorld");
  assert.deepEqual(delays.map(({ ms }) => ms), [100000, 1500]);

  const stalled = createContext([() => new Promise(() => {})]);
  const pending = recognizeText({ image: IMAGE }, {}, stalled.ctx);
  delays.at(-1).controller.abort();
  await assert.rejects(pending, { code: "PROVIDER_TIMEOUT" });
});

test("missing scheduling primitives fail before uploading the image", async () => {
  const { recognizeText } = handlersWithoutTimers(undefined);
  const { ctx, calls } = createContext([]);
  await assert.rejects(recognizeText({ image: IMAGE }, {}, ctx), {
    code: "POLL_DELAY_UNAVAILABLE",
  });
  assert.equal(calls.length, 0);
});

test("failed jobs and missing coordinates are reported", async () => {
  const failed = createContext([
    () => response(JSON.stringify({ code: 0, data: { jobId: "job-4" } })),
    () =>
      response(
        JSON.stringify({
          code: 0,
          data: { state: "failed", errorMsg: "bad file" },
        })
      ),
  ]);
  await assert.rejects(
    handlers.recognizeText({ image: IMAGE }, {}, failed.ctx),
    (error) =>
      error.code === "PROVIDER_ERROR" && !error.message.includes("bad file")
  );

  const noPoly = createContext([
    () => response(JSON.stringify({ code: 0, data: { jobId: "job-5" } })),
    () =>
      response(
        JSON.stringify({
          code: 0,
          data: { state: "done", resultUrl: { jsonUrl: JSON_URL } },
        })
      ),
    () =>
      response(
        JSON.stringify({
          result: {
            ocrResults: [{ prunedResult: { rec_texts: ["Hello"] } }],
          },
        })
      ),
  ]);
  await assert.rejects(
    handlers.recognizeText({ image: IMAGE }, {}, noPoly.ctx),
    (error) => error.code === "INVALID_RESPONSE"
  );
});

test("malformed JSONL fails the complete response", async () => {
  const { ctx } = createContext([
    () => response(JSON.stringify({ code: 0, data: { jobId: "job-6" } })),
    () =>
      response(
        JSON.stringify({
          code: 0,
          data: { state: "done", resultUrl: { jsonUrl: JSON_URL } },
        })
      ),
    () => response(JSON.stringify({ result: OCR_PAGE }) + "\n{"),
  ]);
  await assert.rejects(handlers.recognizeText({ image: IMAGE }, {}, ctx), {
    code: "INVALID_RESPONSE",
  });
});

test("the task deadline includes a stalled submit", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { ctx, calls } = createContext([() => new Promise(() => {})]);
  const pending = handlers.recognizeText({ image: IMAGE }, {}, ctx);
  t.mock.timers.tick(100000);
  await assert.rejects(pending, { code: "PROVIDER_TIMEOUT" });
  assert.equal(calls.length, 1);
});
