// DeepSeek-OCR requires the image before the task prompt in its chat content.
exports.parseImage = async function (input, config, ctx) {
  if (
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
      input.image.mimeType,
    )
  ) {
    var invalid = new Error("Unsupported image MIME type.");
    invalid.code = "INVALID_ASSET";
    throw invalid;
  }
  var bytes = await ctx.assets.read(input.image);
  if (bytes.byteLength > 8 * 1024 * 1024) {
    var oversized = new Error("Image exceeds 8 MiB.");
    oversized.code = "RESOURCE_BUDGET_EXCEEDED";
    throw oversized;
  }
  var request = ctx.helpers.openai.chatCompletions.buildRequest({
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: 0,
    auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url:
                "data:" +
                input.image.mimeType +
                ";base64," +
                ctx.helpers.encoding.bytesToBase64(bytes),
            },
          },
          { type: "text", text: input.prompt || "Free OCR." },
        ],
      },
    ],
  });
  var result = ctx.helpers.openai.chatCompletions.parseResponse(
    await ctx.http.request(request),
  );
  return {
    text: result.text,
    format: "text",
    items: result.text
      .split(/\r?\n/)
      .filter(Boolean)
      .map(function (text) {
        return { text: text, poly: null };
      }),
  };
};
