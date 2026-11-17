exports.parseImage = async function (input, config, ctx) {
  var bytes = await ctx.assets.read(input.image);
  var messages = await ctx.helpers.openai.chatCompletions.prepareMessages(
    ctx.helpers.textTasks.buildMessages("parseImage", input),
    async function () {
      return bytes;
    },
  );
  var request = ctx.helpers.openai.chatCompletions.buildRequest({
    baseUrl: config.baseUrl,
    model: config.model,
    messages: messages,
    temperature: 0,
    max_tokens: 4096,
    stream: false,
    chat_template_kwargs: { enable_thinking: false },
  });
  var result = ctx.helpers.openai.chatCompletions.parseResponse(
    await ctx.http.request(request),
  );
  return ctx.helpers.textTasks.parseResult("parseImage", result.text, input);
};
