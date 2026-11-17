// Kimi 的思考和采样参数按模型区分，传了模型不接受的参数会返回 400，
// 所以请求参数由模型 ID 决定。Kimi Code 与开放平台两个服务共用本脚本。
var MAX_COMPLETION_TOKENS = 16384;

function modelName(model) {
  return String(model || "")
    .trim()
    .toLowerCase();
}

// K 系列固定采样参数，传 temperature / top_p 会返回 400，因此不发送；
// 同时显式给出输出上限，避免思考内容占满默认上限导致截断。
function isKSeries(name) {
  return /^(kimi-|k3)/.test(name);
}

function thinkingParameters(name, mode, effort) {
  // 接口默认：不发送任何思考参数。
  if (mode !== "enabled" && mode !== "disabled") return {};
  var enabled = mode === "enabled";
  // 开启时只发送用户选定的强度；无法关闭思考的模型在关闭时降到 low。
  var level = enabled ? (effort && effort !== "_default" ? effort : null) : "low";
  var withEffort = function (params) {
    return level ? Object.assign(params, { reasoning_effort: level }) : params;
  };
  // 开放平台 K3 系列始终思考，只接受 reasoning_effort。
  if (/^kimi-k3(\.1-pro(-highspeed)?)?$/.test(name)) return withEffort({});
  // 开放平台 K2.7 Code 始终思考，收到 thinking 参数会报错，也没有强度参数。
  if (/^kimi-k2\.7-code(-highspeed)?$/.test(name)) return {};
  // Kimi Code 的 K3.1 Pro 拒绝 disabled，关闭时只能降到最低强度。
  if (/^k3\.1-pro(-highspeed)?$/.test(name))
    return withEffort({ thinking: { type: "enabled" } });
  // 其余 Kimi Code 模型用 thinking.type 开关，开启时可指定强度。
  if (["kimi-for-coding", "k3", "k3-256k"].indexOf(name) !== -1)
    return enabled
      ? withEffort({ thinking: { type: "enabled" } })
      : { thinking: { type: "disabled" } };
  // 只有开关、没有强度参数的模型。
  if (["kimi-k2.6", "kimi-for-coding-highspeed"].indexOf(name) !== -1)
    return { thinking: { type: enabled ? "enabled" : "disabled" } };
  return {};
}

function requestParameters(config) {
  var name = modelName(config.model);
  return Object.assign(
    isKSeries(name) ? { max_completion_tokens: MAX_COMPLETION_TOKENS } : {},
    thinkingParameters(name, config.thinkingMode, config.thinkingEffort),
  );
}

async function complete(messages, config, ctx, translationInput) {
  if (!config.model || !config.baseUrl) {
    throw new Error("请配置模型和 API 基础地址");
  }
  var streaming = Boolean(ctx.options && ctx.options.streaming);
  var request = ctx.helpers.openai.chatCompletions.buildRequest(
    Object.assign(requestParameters(config), {
      baseUrl: config.baseUrl,
      model: config.model,
      messages: messages,
      stream: streaming,
      auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
    }),
  );
  if (!streaming) {
    return ctx.helpers.openai.chatCompletions.parseResponse(
      await ctx.http.request(request),
    );
  }
  var parser = ctx.helpers.openai.chatCompletions.createStreamParser();
  var translation = translationInput
    ? await ctx.helpers.translation.createStreamParser(translationInput)
    : null;
  for await (var frame of ctx.http.stream(request)) {
    if (frame.type !== "sse") continue;
    for (var event of parser.push(frame.data)) {
      // 翻译只解析正文，思考内容不进入译文。
      if (translation) {
        if (event.type === "text.delta")
          for (var item of translation.push(event.text)) await ctx.emit(item);
      } else await ctx.emit(event);
    }
  }
  // SSE 终止帧和全部翻译 ID 都必须完整。
  var result = parser.finish();
  return translation ? translation.finish() : result;
}

exports.chat = async function (input, config, ctx) {
  return complete(input.messages, config, ctx);
};

exports.translate = async function (input, config, ctx) {
  var messages = ctx.helpers.translation.buildMessages(input);
  var result = await complete(messages, config, ctx, input);
  if (ctx.options && ctx.options.streaming) return result;
  return ctx.helpers.translation.parseResult(result.text, input);
};

exports.dictionary = async function (input, config, ctx) {
  var messages = ctx.helpers.textTasks.buildMessages("dictionary", input);
  var result = await complete(messages, config, ctx);
  return ctx.helpers.textTasks.parseResult("dictionary", result.text, input);
};

exports.segmentSubtitle = async function (input, config, ctx) {
  if (ctx.options && ctx.options.streaming)
    throw new Error("Subtitle segmentation requires a complete response.");
  var messages = ctx.helpers.textTasks.buildMessages("segmentSubtitle", input);
  var result = await complete(messages, config, ctx);
  return ctx.helpers.textTasks.parseResult(
    "segmentSubtitle",
    result.text,
    input,
  );
};
