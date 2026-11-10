var origin = "https://maas.qianwenaiapi.com";
var noSpeech = "[NO_SPEECH]";
var audioFormats = {
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
};

function failure(code, message) {
  var error = new Error(message);
  error.code = code;
  return error;
}

async function encodeAudio(input, ctx) {
  var mime = input.audio.mimeType.split(";")[0].trim().toLowerCase();
  var format = audioFormats[mime];
  if (!format) throw failure("INVALID_ASSET", "Unsupported audio format.");
  var bytes = await ctx.assets.read(input.audio);
  var data = ctx.helpers.encoding.bytesToBase64(bytes);
  // M4A is AAC in an MP4 container. Keep the original bytes.
  return {
    data: "data:" + (format === "m4a" ? "audio/mp4" : mime) + ";base64," + data,
    format,
  };
}

function decodeJson(raw) {
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw failure("INVALID_RESPONSE", "Invalid Qianwen ASR JSON.");
  }
}

exports.transcribe = async function (input, config, ctx) {
  var audio = await encodeAudio(input, ctx);
  var parameters = { format: audio.format };
  if (input.language && input.language !== "auto")
    parameters.language_hints = [ctx.helpers.languages.toIso6391(input.language)];
  var response = await ctx.http.request({
    url: origin + "/api/v1/services/aigc/multimodal-generation/generation",
    method: "POST",
    auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
    headers: { "Content-Type": "application/json", "X-DashScope-SSE": "enable" },
    bodyType: "json",
    body: {
      model: config.model,
      input: {
        messages: [{
          role: "user",
          content: [{ type: "input_audio", input_audio: { data: audio.data } }],
        }],
      },
      parameters: parameters,
    },
  });
  var frames;
  if (response.headers["content-type"]?.includes("text/event-stream")) {
    var parser = ctx.helpers.stream.createSSEParser();
    frames = parser.push(response.body)
      .filter((frame) => frame.data.trim() !== "[DONE]")
      .map((frame) => decodeJson(frame.data));
    parser.finish();
  } else {
    frames = [decodeJson(response.body)];
  }

  var text = "";
  var segments = [];
  var stableWords = [];
  var finished = false;
  var previousEnd = 0;
  for (var frame of frames) {
    if (!frame?.output || frame.code)
      throw failure("PROVIDER_ERROR", "Qianwen ASR returned an error.");
    var output = frame.output;
    var sentence = output.sentence;
    finished = sentence?.sentence_end === true;
    if (!finished) continue;
    var start = sentence.begin_time;
    var end = sentence.end_time;
    var sentenceText = sentence.text?.trim();
    var words = Array.isArray(sentence.words) ? sentence.words : [];
    if (
      typeof output.text !== "string" || !sentenceText ||
      !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start
    )
      throw failure("INVALID_RESPONSE", "Invalid Qianwen ASR sentence.");

    // The 3.1 stream may repeat all preceding text and words in a later sentence.
    if (start < previousEnd) {
      var firstNewWord = words.find((word) => word.begin_time >= previousEnd);
      if (!firstNewWord || !sentenceText.startsWith(text))
        throw failure("INVALID_RESPONSE", "Cannot align cumulative Qianwen ASR sentence.");
      sentenceText = sentenceText.slice(text.length).trim();
      start = firstNewWord.begin_time;
    }
    if (!sentenceText || start >= end)
      throw failure("INVALID_RESPONSE", "Missing new Qianwen ASR sentence.");
    segments.push({ start: start / 1000, end: end / 1000, text: sentenceText });
    previousEnd = end;
    text = output.text.trim();
    var currentWords = words
      .filter((word) =>
        word.fixed !== false && Number.isFinite(word.begin_time) &&
        Number.isFinite(word.end_time) && typeof word.text === "string"
      )
      .map((word) => ({
        start: word.begin_time / 1000,
        end: word.end_time / 1000,
        text: word.text + (word.punctuation || ""),
      }));
    if (currentWords.length) {
      stableWords = stableWords
        .filter((word) => word.end <= currentWords[0].start)
        .concat(currentWords);
    }
  }
  if (!finished || !text)
    throw failure("INCOMPLETE_RESPONSE", "Qianwen ASR ended before the final sentence.");
  return ctx.helpers.openai.audio.parseTranscription({
    status: response.status,
    body: { text: text, segments: segments, words: stableWords },
  });
};

async function readOmni(content, config, ctx) {
  var sdk = ctx.helpers.openai.chatCompletions;
  var request = sdk.buildRequest({
    baseUrl: origin + "/compatible-mode/v1",
    model: config.model,
    auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
    messages: [{ role: "user", content: content }],
    stream: true,
    enable_thinking: false,
  });
  var parser = sdk.createStreamParser();
  for await (var frame of ctx.http.stream(request)) {
    if (frame.type === "headers") {
      if (frame.status < 200 || frame.status >= 300)
        throw failure("HTTP_ERROR", "Qianwen Omni HTTP " + frame.status);
    } else {
      parser.push(frame);
    }
  }
  return parser.finish().text.trim();
}

exports.transcribeOmni = async function (input, config, ctx) {
  if (input.requireTimestamps)
    throw failure("TASK_UNSUPPORTED", "This Qianwen service returns transcripts without timestamps.");
  var audio = await encodeAudio(input, ctx);
  var text = await readOmni([
    { type: "input_audio", input_audio: audio },
    { type: "text", text: "Transcribe the speech verbatim in its original language. Return only the transcript, or " + noSpeech + " if there is no speech." },
  ], config, ctx);
  if (!text) throw failure("INVALID_RESPONSE", "Qianwen Omni returned an empty transcript.");
  return { text: text === noSpeech ? "" : text };
};

exports.parseImage = async function (input, config, ctx) {
  var task = ctx.helpers.textTasks;
  var sdk = ctx.helpers.openai.chatCompletions;
  var messages = await sdk.prepareMessages(task.buildMessages("parseImage", input), ctx.assets.read);
  var text = await readOmni(messages[0].content, config, ctx);
  return task.parseResult("parseImage", text, input, { coordinates: false });
};
