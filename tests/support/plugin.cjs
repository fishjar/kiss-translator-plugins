const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Execute only this repository's trusted scripts. These unit tests mock SDK calls;
// Sval and real SDK behavior are covered separately by optional host integration.
function script(plugin, entry) {
  const sandbox = { exports: {} };
  const file = path.resolve(__dirname, "../../plugins", plugin, entry);
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox, {
    filename: file,
    timeout: 1000,
  });
  return sandbox.exports;
}

function probe() {
  const built = [],
    requests = [];
  const ctx = {
    options: { streaming: false },
    secrets: { ref: (key) => ({ key }) },
    assets: { read: async () => Uint8Array.from([0, 127, 128, 255]).buffer },
    helpers: {
      encoding: {
        bytesToBase64: (bytes) => Buffer.from(bytes).toString("base64"),
      },
      languages: { toIso6391: (language) => language },
      openai: {
        chatCompletions: {
          buildRequest: (options) => {
            built.push(options);
            return {
              url: "https://sdk-stub.invalid/chat/completions",
              body: options,
            };
          },
          parseResponse: () => ({ text: "recognized\nsecond line" }),
        },
        audio: { parseTranscription: () => ({ text: "transcribed" }) },
      },
    },
    http: {
      request: async (request) => {
        requests.push(request);
        return { body: "{}" };
      },
    },
  };
  return {
    ctx,
    built,
    requests,
    config: {
      baseUrl: "https://provider.invalid/v1",
      model: "test-model",
      temperature: 0.3,
    },
  };
}
module.exports = { script, probe };
