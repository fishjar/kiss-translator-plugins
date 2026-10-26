// Both ASR services require filename extensions for some audio containers.
exports.transcribe = async function (input, config, ctx) {
  var filename = input.audio.filename;
  if (!filename || !/\.[A-Za-z0-9]+$/.test(filename)) {
    var formats = {
      "audio/wav": "wav",
      "audio/wave": "wav",
      "audio/x-wav": "wav",
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/mp4": "m4a",
      "audio/m4a": "m4a",
      "audio/x-m4a": "m4a",
      "audio/flac": "flac",
      "audio/x-flac": "flac",
      "audio/ogg": "ogg",
      "audio/webm": "webm",
      "audio/aac": "aac",
    };
    var mime = input.audio.mimeType.split(";")[0].trim().toLowerCase();
    if (!formats[mime]) {
      var invalid = new Error(
        "Cannot determine the audio filename extension: " + mime,
      );
      invalid.code = "INVALID_ASSET";
      throw invalid;
    }
    filename = "audio." + formats[mime];
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
  request.bodyType = "multipart";
  request.body = {
    file: { ...input.audio, filename: filename },
    model: config.model,
  };
  var response = await ctx.http.request(request);
  var data =
    typeof response.body === "string"
      ? JSON.parse(response.body)
      : response.body;
  if (data && data.message) {
    var failure = new Error(data.message);
    failure.code = "PROVIDER_ERROR";
    throw failure;
  }
  return ctx.helpers.openai.audio.parseTranscription(response);
};
