// PaddleOCR 官方异步任务 API。
// 基本流程与官方示例一致：提交任务 -> 轮询任务状态 -> 下载 JSONL -> 解析结果。
// recognizeText 用于 PP-OCR 文字识别；parseImage 用于 PP-StructureV3 / PaddleOCR-VL 文档解析。
var DEFAULT_BASE_URL = "https://paddleocr.aistudio-app.com";
var POLL_INITIAL_MS = 1500;
var POLL_MAX_MS = 5000;
// 宿主对插件调用的默认超时是 120 秒，这里预留下载与解析时间。
var JOB_BUDGET_MS = 100000;
// 仅列出通过云端验收的模型，与 manifest 中的推荐列表一致。
var OCR_MODELS = ["PP-OCRv6", "PP-OCRv5", "PP-OCRv5-latin"];
var DOC_MODELS = ["PaddleOCR-VL-1.6", "PaddleOCR-VL-1.5", "PP-StructureV3"];

function fail(code, message) {
  throw Object.assign(new Error(message), { code: code });
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function pickModel(config, models) {
  var value = config && config.model;
  return models.indexOf(value) >= 0 ? value : models[0];
}

function imageRef(ref) {
  var mimeType = String(ref.mimeType || "image/png");
  var ext =
    mimeType === "image/jpeg"
      ? ".jpg"
      : mimeType === "image/webp"
        ? ".webp"
          : mimeType === "image/png"
            ? ".png"
            : null;
  if (!ext) fail("INVALID_INPUT", "PaddleOCR 需要 PNG、JPEG 或 WebP 图片");
  // 官方 multipart 解析依赖文件名后缀；资产缺少 filename 时按 MIME 补一个。
  return {
    assetId: ref.assetId,
    mimeType: mimeType,
    filename: "image" + ext,
  };
}

function bearer(ctx) {
  return { type: "bearer", secret: ctx.secrets.ref("apiKey") };
}

function jobEndpoint(config) {
  var base = (config.baseUrl || DEFAULT_BASE_URL).trim();
  if (!/^https?:\/\/[^/\s@?#\\]+(?:\/[^?#\s\\]*)?$/i.test(base))
    fail("INVALID_CONFIG", "PaddleOCR 接口地址须为 HTTP(S) 基础地址");
  return base.replace(/\/+$/, "") + "/api/v2/ocr/jobs";
}

async function readJson(ctx, request) {
  var response = await ctx.http.request(request);
  var data;
  try {
    data = JSON.parse(response.body);
  } catch (error) {
    fail("INVALID_RESPONSE", "PaddleOCR 返回了无法解析的 JSON");
  }
  if (!data || data.code !== 0) {
    var providerCode = data && data.code;
    fail(
      "PROVIDER_ERROR",
      Number.isInteger(providerCode)
        ? "PaddleOCR 请求失败（错误码 " + providerCode + "）"
        : "PaddleOCR 请求失败（缺少成功状态码）"
    );
  }
  return data.data;
}

async function reportProgress(ctx, message, progress) {
  if (!ctx.emit) return;
  try {
    await ctx.emit({ type: "progress", message: message, progress: progress });
  } catch (error) {
    // 进度事件失败不应中断识别任务。
  }
}

async function readJsonl(ctx, url) {
  // 结果地址是 BOS 预签名链接，自带鉴权参数；附加 Authorization 会返回 400。
  var response = await ctx.http.request({
    url: url,
    method: "GET",
    responseType: "text",
  });
  var lines = String(response.body || "").split(/\r?\n/);
  var pages = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      fail("INVALID_RESPONSE", "PaddleOCR 返回了无法解析的 JSONL 结果");
    }
    if (!parsed || !parsed.result || typeof parsed.result !== "object")
      fail("INVALID_RESPONSE", "PaddleOCR JSONL 缺少页面结果");
    pages.push(parsed.result);
  }
  if (!pages.length) fail("INVALID_RESPONSE", "PaddleOCR 返回了空结果");
  return pages;
}

function jobTimedOut() {
  fail("PROVIDER_TIMEOUT", "PaddleOCR 任务超时");
}

async function runJob(ctx, input, config, model, optionalPayload) {
  if (!input || !input.image) fail("INVALID_INPUT", "缺少图片资产");
  var endpoint = jobEndpoint(config);
  var deadline = Date.now() + JOB_BUDGET_MS;
  var timer;
  var pages;
  try {
    pages = await Promise.race([
      submitAndPoll(ctx, input, endpoint, model, optionalPayload, deadline),
      new Promise(function (resolve, reject) {
        timer = setTimeout(function () {
          reject(Object.assign(new Error("PaddleOCR 任务超时"), {
            code: "PROVIDER_TIMEOUT",
          }));
        }, JOB_BUDGET_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  return pages;
}

async function submitAndPoll(ctx, input, endpoint, model, optionalPayload, deadline) {
  var submitted = await readJson(ctx, {
    url: endpoint,
    method: "POST",
    auth: bearer(ctx),
    bodyType: "multipart",
    body: {
      file: imageRef(input.image),
      model: model,
      optionalPayload: JSON.stringify(optionalPayload),
    },
    responseType: "text",
  });
  var jobId = submitted && submitted.jobId;
  if (typeof jobId !== "string" || !jobId.trim())
    fail("INVALID_RESPONSE", "PaddleOCR 未返回任务 ID");
  await reportProgress(ctx, "PADDLEOCR_SUBMITTED");

  var interval = POLL_INITIAL_MS;
  while (Date.now() < deadline) {
    var status = await readJson(ctx, {
      url: endpoint + "/" + encodeURIComponent(jobId),
      method: "GET",
      auth: bearer(ctx),
      responseType: "text",
    });
    if (Date.now() >= deadline) jobTimedOut();
    var state = status && status.state;
    if (state === "failed") {
      fail(
        "PROVIDER_ERROR",
        "PaddleOCR 任务解析失败"
      );
    }
    if (state === "done") {
      var jsonUrl = status.resultUrl && status.resultUrl.jsonUrl;
      if (typeof jsonUrl !== "string" || !/^https:\/\//i.test(jsonUrl))
        fail("INVALID_RESPONSE", "PaddleOCR 未返回 HTTPS 结果地址");
      return await readJsonl(ctx, jsonUrl);
    }
    if (state !== "pending" && state !== "running")
      fail("INVALID_RESPONSE", "PaddleOCR 返回了未知任务状态");
    var extract = status && status.extractProgress;
    var total = extract ? Number(extract.totalPages) : 0;
    var extracted = extract ? Number(extract.extractedPages) : 0;
    await reportProgress(
      ctx,
      "PADDLEOCR_" + String(state || "running").toUpperCase(),
      total > 0 && Number.isFinite(extracted)
        ? Math.min(1, Math.max(0, extracted / total))
        : undefined
    );
    var wait = Math.min(interval, Math.max(0, deadline - Date.now()));
    if (wait <= 0) break;
    await sleep(wait);
    interval = Math.min(Math.round(interval * 1.5), POLL_MAX_MS);
  }
  jobTimedOut();
}

function isFlatBox(box) {
  if (!Array.isArray(box) || box.length !== 4) return false;
  for (var i = 0; i < box.length; i++)
    if (!Number.isFinite(box[i])) return false;
  return box[2] > box[0] && box[3] > box[1];
}

function isPointPoly(poly) {
  if (!Array.isArray(poly) || poly.length < 3) return false;
  for (var i = 0; i < poly.length; i++) {
    var point = poly[i];
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1])
    )
      return false;
  }
  return true;
}

function normalizePoly(poly, box) {
  if (isPointPoly(poly) && hasArea(poly)) return poly;
  // layoutShapeMode 为 quad/poly 时，block_bbox 会直接返回点集。
  if (isPointPoly(box) && hasArea(box)) return box;
  if (!isFlatBox(box)) return null;
  var left = box[0];
  var top = box[1];
  var right = box[2];
  var bottom = box[3];
  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ];
}

function hasArea(poly) {
  if (!poly || poly.length < 3) return false;
  var area = 0;
  for (var i = 0; i < poly.length; i++) {
    var next = poly[(i + 1) % poly.length];
    area += poly[i][0] * next[1] - next[0] * poly[i][1];
  }
  return Math.abs(area) > 0;
}

function parseOcrPages(pages) {
  var items = [];
  for (var p = 0; p < pages.length; p++) {
    var results = pages[p].ocrResults || [];
    for (var r = 0; r < results.length; r++) {
      var pruned = results[r].prunedResult || {};
      var texts = Array.isArray(pruned.rec_texts) ? pruned.rec_texts : [];
      var polys = Array.isArray(pruned.rec_polys) ? pruned.rec_polys : [];
      var boxes = Array.isArray(pruned.rec_boxes) ? pruned.rec_boxes : [];
      var scores = Array.isArray(pruned.rec_scores) ? pruned.rec_scores : [];
      for (var i = 0; i < texts.length; i++) {
        var text = typeof texts[i] === "string" ? texts[i].trim() : "";
        if (!text) continue;
        var poly = normalizePoly(polys[i], boxes[i]);
        // manifest 声明了 coordinates: true，缺少有效坐标时不能静默通过。
        if (!poly)
          fail("INVALID_RESPONSE", "PaddleOCR 未返回有效的文字坐标");
        var item = { text: text, poly: poly };
        var score = scores[i];
        if (Number.isFinite(score) && score >= 0 && score <= 1)
          item.confidence = score;
        items.push(item);
      }
    }
  }
  if (!items.length)
    fail("INVALID_RESPONSE", "PaddleOCR 未识别到有效文字");
  var lines = [];
  for (var j = 0; j < items.length; j++) lines.push(items[j].text);
  return { text: lines.join("\n"), items: items, format: "text" };
}

// 官方 VLM 会把版面图片写成 <div><img src="imgs/xxx.jpg" /></div>，
// 或使用 ![](imgs/xxx.jpg)。插件不保存结果图片，解析时统一清理。
var VLM_IMAGE_BLOCK_RE = /<div\b[^>]*>\s*<img\b[^>]*\/?>\s*<\/div>/gi;
var VLM_IMAGE_TAG_RE = /<img\b[^>]*\/?>/gi;
var VLM_MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\([^)]*\)/g;
var HTML_BREAK_RE = /<br\s*\/?>/gi;
var HTML_CELL_END_RE = /<\/(?:td|th)>/gi;
var HTML_LINE_END_RE = /<\/(?:tr|p|div|li|h[1-6]|table|blockquote|pre)>/gi;
var HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/g;
var HTML_ENTITY_RE = /&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi;
var HTML_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeHtmlEntities(text) {
  return String(text || "").replace(HTML_ENTITY_RE, function (match, entity) {
    var key = entity.toLowerCase();
    if (key.charAt(0) === "#") {
      var code =
        key.indexOf("#x") === 0
          ? parseInt(key.slice(2), 16)
          : parseInt(key.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0xffff
        ? String.fromCharCode(code)
        : match;
    }
    var value = HTML_ENTITIES[key];
    return value === undefined ? match : value;
  });
}

function stripVlmImageMarkup(text) {
  return String(text || "")
    .replace(VLM_IMAGE_BLOCK_RE, "")
    .replace(VLM_IMAGE_TAG_RE, "")
    .replace(VLM_MARKDOWN_IMAGE_RE, "");
}

function normalizeVlmMarkdown(text) {
  return stripVlmImageMarkup(text)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeVlmPlainText(text) {
  var plain = decodeHtmlEntities(
    stripVlmImageMarkup(text)
      .replace(/\r\n?/g, "\n")
      .replace(HTML_BREAK_RE, "\n")
      .replace(HTML_CELL_END_RE, " ")
      .replace(HTML_LINE_END_RE, "\n")
      .replace(HTML_TAG_RE, "")
  );
  var lines = plain.split("\n");
  var output = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/[ \t]+/g, " ").trim();
    if (line) output.push(line);
  }
  return output.join("\n");
}

// 逐页解析：有 parsing_res_list 时以版面块为准（含 markdown.text 默认忽略的
// 页眉、页脚、页码、脚注）；整页没有版面块时才回退到 markdown.text。
function parseDocPages(pages) {
  var pageResults = [];
  for (var p = 0; p < pages.length; p++) {
    var results = pages[p].layoutParsingResults || [];
    for (var r = 0; r < results.length; r++) {
      var result = results[r];
      var list =
        result && result.prunedResult && result.prunedResult.parsing_res_list;
      var blocks = [];
      if (Array.isArray(list)) {
        for (var b = 0; b < list.length; b++) {
          var block = list[b];
          var content =
            block && typeof block.block_content === "string"
              ? block.block_content
              : "";
          var markdown = normalizeVlmMarkdown(content);
          if (!markdown) continue;
          blocks.push({
            type: (block && block.block_label) || "text",
            markdown: markdown,
            text:
              block.block_label === "table" ||
              /formula/.test(block.block_label || "")
                ? markdown
                : normalizeVlmPlainText(content) || markdown,
            poly: normalizePoly(null, block && block.block_bbox),
          });
        }
      }
      if (blocks.length) {
        var parts = [];
        for (var i = 0; i < blocks.length; i++) parts.push(blocks[i].markdown);
        pageResults.push({ blocks: blocks, text: parts.join("\n\n") });
        continue;
      }
      var fallback = normalizeVlmMarkdown(
        result && result.markdown && result.markdown.text
      );
      if (fallback) pageResults.push({ blocks: [], text: fallback });
    }
  }
  if (!pageResults.length)
    fail("INVALID_RESPONSE", "PaddleOCR 未返回文档解析结果");

  var texts = [];
  var items = [];
  for (var pageIndex = 0; pageIndex < pageResults.length; pageIndex++) {
    var page = pageResults[pageIndex];
    texts.push(page.text);
    if (page.blocks.length) {
      for (var index = 0; index < page.blocks.length; index++) {
        var item = {
          text: page.blocks[index].text,
          type: page.blocks[index].type,
        };
        item.poly = page.blocks[index].poly;
        items.push(item);
      }
    } else {
      items.push({ text: page.text, poly: null });
    }
  }
  return { text: texts.join("\n\n"), items: items, format: "markdown" };
}

exports.recognizeText = async function (input, config, ctx) {
  var model = pickModel(config, OCR_MODELS);
  var payload = {
    useDocOrientationClassify: false,
    useDocUnwarping: false,
    useTextlineOrientation: false,
  };
  var pages = await runJob(ctx, input, config, model, payload);
  return parseOcrPages(pages);
};

exports.parseImage = async function (input, config, ctx) {
  var model = pickModel(config, DOC_MODELS);
  var payload = {
    useDocOrientationClassify: false,
    useDocUnwarping: false,
    // 只为翻译取文字，不需要回传版面图片。
    returnMarkdownImages: false,
  };
  if (model === "PP-StructureV3") {
    payload.useTableRecognition = true;
    payload.useFormulaRecognition = true;
  } else {
    payload.useLayoutDetection = true;
  }
  var pages = await runJob(ctx, input, config, model, payload);
  return parseDocPages(pages);
};
