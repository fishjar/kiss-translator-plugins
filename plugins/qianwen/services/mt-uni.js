function languageCode(value) {
  var code = value.trim().toLowerCase();
  if (code === "ro_ur" || code === "ro-ur") return "ro_ur";
  code = code.replace(/_/g, "-");
  if (/^zh-(?:hant|tw|hk|mo)(?:-|$)/.test(code)) return "zh-tw";
  if (code === "pt-pt") return code;
  var base = code.split("-")[0];
  if (base === "fil") return "tl";
  if (base === "iw") return "he";
  return base;
}

function failure(code, message) {
  var error = new Error(message);
  error.code = code;
  return error;
}

exports.translate = async function (input, config, ctx) {
  var texts = input.items.map(function (item) {
    if (input.textFormat === "html" && /<(?:\/?(?:i|a|b|x|span)\d+|(?:i|a|b|x|span) i=\d+)>/i.test(item.text)) {
      throw failure("INVALID_INPUT", "Disable rich-text translation to use Qwen-MT-Uni on this page.");
    }
    return item.text;
  });
  var batch = input.translationMode === "batch" || texts.length > 1;
  var requestInput = {
    source_texts: batch ? texts : texts[0],
    target_lang: languageCode(input.targetLanguage),
  };
  if (input.sourceLanguage && input.sourceLanguage !== "auto") {
    requestInput.source_lang = languageCode(input.sourceLanguage);
  }
  var response = await ctx.http.request({
    url: config.baseUrl.replace(/\/+$/, "") + "/services/aigc/multimodal-generation/generation",
    method: "POST",
    auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
    bodyType: "json",
    responseType: "text",
    body: { model: "qwen-mt-uni", input: requestInput },
  });
  var data;
  try {
    data = JSON.parse(response.body);
  } catch {
    throw failure("INVALID_RESPONSE", "Invalid Qwen-MT-Uni JSON.");
  }
  var output = data?.output;
  var errorCode = typeof data?.code === "string" ? data.code.trim() : "";
  if (errorCode || output?.Success === false) {
    var detail = data.message || output?.Message || "Translation failed.";
    var code = errorCode || output?.Code;
    var requestId = data.request_id || output?.RequestId;
    throw failure("PROVIDER_ERROR", "Qwen-MT-Uni" + (code == null ? "" : " [" + code + "]") +
      ": " + detail + (requestId ? " (request ID: " + requestId + ")" : ""));
  }
  var translated = output?.Data?.TranslatedTexts;
  if (output?.Success !== true || (batch
    ? !Array.isArray(translated) || translated.length !== texts.length
    : typeof translated !== "string")) {
    throw failure("INVALID_RESPONSE", "Qwen-MT-Uni returned an unexpected translation result.");
  }
  var results = batch ? translated : [translated];
  return { items: input.items.map(function (item, index) {
    var text = results[index];
    if (typeof text !== "string" || !text.trim()) {
      throw failure("INVALID_RESPONSE", "Qwen-MT-Uni returned an empty or invalid translation.");
    }
    var placeholders = item.text.match(/\{\{\d+\}\}/g);
    if (placeholders && placeholders.sort().join() !== (text.match(/\{\{\d+\}\}/g) || []).sort().join()) {
      throw failure("INVALID_RESPONSE", "Qwen-MT-Uni did not preserve the original placeholders.");
    }
    return { id: item.id, text: text };
  }) };
};
