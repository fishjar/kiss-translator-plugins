exports.translate = async function (input, config, ctx) {
  var request = ctx.helpers.openai.chatCompletions.buildRequest({
    baseUrl: config.baseUrl,
    model: config.model,
    messages: ctx.helpers.translation.buildMessages(input),
    temperature: 0,
    max_tokens: 4096,
    stream: false,
    chat_template_kwargs: { enable_thinking: false },
  });
  var result = ctx.helpers.openai.chatCompletions.parseResponse(
    await ctx.http.request(request),
  );
  return ctx.helpers.translation.parseResult(result.text, input);
};
