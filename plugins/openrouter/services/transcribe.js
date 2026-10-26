exports.transcribe = async function (input, config, ctx) {
  var formats = {
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/x-m4a": "m4a",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "audio/aac": "aac",
  };
  var mime = input.audio.mimeType.split(";")[0].trim().toLowerCase();
  var format = formats[mime];
  if (!format)
    throw new Error("Unsupported OpenRouter audio MIME type: " + mime);
  var bytes = await ctx.assets.read(input.audio);
  var body = {
    model: config.model,
    input_audio: {
      data: ctx.helpers.encoding.bytesToBase64(bytes),
      format: format,
    },
    response_format: "json",
  };
  if (input.language && input.language !== "auto") {
    body.language = ctx.helpers.languages.toIso6391(input.language);
  }
  var request = ctx.helpers.openai.chatCompletions.buildRequest({
    baseUrl: config.baseUrl,
    model: config.model,
    messages: [],
    auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
  });
  request.url = request.url.replace(
    /chat\/completions$/,
    "audio/transcriptions",
  );
  request.body = body;
  var result = ctx.helpers.openai.audio.parseTranscription(
    await ctx.http.request(request),
  );
  return { text: result.text };
};
