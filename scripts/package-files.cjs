const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { unzipSync } = require("fflate");

const safePath = (value) =>
  typeof value === "string" &&
  /^[\w./-]+$/.test(value) &&
  !value.startsWith("/") &&
  !value.split("/").some((part) => ["", ".", ".."].includes(part));
const validVersion = (value) =>
  typeof value === "string" &&
  /^\d+\.\d+\.\d+$/.test(value) &&
  value.split(".").every((part) => Number.isSafeInteger(Number(part)));
const requireValue = (valid, message) => {
  if (!valid)
    throw Object.assign(new Error(message), { code: "INVALID_PACKAGE" });
};

// This is the publisher's package check, not a copy of the host SDK/runtime.
function packagePaths(manifest) {
  requireValue(
    manifest.manifestVersion === 1 &&
      ["1", "2"].includes(manifest.apiVersion) &&
      /^[a-z][a-z0-9-]{1,100}$/.test(manifest.id) &&
      validVersion(manifest.version),
    "Invalid manifest identity/version",
  );
  requireValue(
    manifest.kind === undefined || manifest.kind === "provider",
    "Unsupported plugin kind",
  );
  requireValue(
    manifest.minHostVersion === undefined ||
      validVersion(manifest.minHostVersion),
    "Invalid minHostVersion",
  );
  requireValue(
    Array.isArray(manifest.services) && manifest.services.length,
    "Missing services",
  );
  const entries = new Set(["manifest.json"]),
    ids = new Set();
  for (const service of manifest.services) {
    requireValue(
      /^[A-Za-z][\w-]{0,100}$/.test(service?.id) &&
        !["constructor", "prototype", "__proto__"].includes(service.id) &&
        !ids.has(service.id),
      "Invalid or duplicate service ID",
    );
    requireValue(
      ["script", "declarative"].includes(service.implementation?.kind) &&
        service.capabilities &&
        !Array.isArray(service.capabilities) &&
        Object.keys(service.capabilities).length,
      "Missing service implementation/capabilities: " + service.id,
    );
    requireValue(
      !Object.hasOwn(service.capabilities, "speak"),
      "System speech is native-only",
    );
    ids.add(service.id);
    for (const model of service.models || [])
      requireValue(
        model?.capabilities === undefined,
        "Model capabilities must be declared on separate services: " +
          service.id,
      );
    entries.add(service.implementation.entry);
  }
  for (const resource of manifest.resources || []) entries.add(resource.path);
  if (manifest.icon !== undefined) entries.add(manifest.icon);
  requireValue([...entries].every(safePath), "Invalid package path");
  return [...entries];
}

function validatePackageFiles(files) {
  const names = Object.keys(files);
  requireValue(
    names.length <= 100 && names.every(safePath),
    "Invalid package paths or file count",
  );
  requireValue(
    names.reduce((size, name) => size + files[name].byteLength, 0) <=
      10 * 1024 * 1024,
    "Unpacked package exceeds 10 MiB",
  );
  requireValue(files["manifest.json"], "manifest.json must be at package root");
  const manifest = JSON.parse(
    Buffer.from(files["manifest.json"]).toString("utf8"),
  );
  for (const entry of packagePaths(manifest))
    requireValue(files[entry], "Missing package entry: " + entry);
  for (const service of manifest.services) {
    const source = Buffer.from(files[service.implementation.entry]).toString(
      "utf8",
    );
    if (service.implementation.kind === "script") {
      // Parse only. Checking a downloaded ZIP must never execute its script.
      new vm.Script(source, { filename: service.implementation.entry });
    } else {
      const rules = JSON.parse(source);
      requireValue(
        [1, 2].includes(rules.rulesVersion) &&
          rules.handlers &&
          typeof rules.handlers === "object",
        "Invalid declarative rules: " + service.id,
      );
      for (const [name, descriptor] of Object.entries(service.capabilities)) {
        requireValue(
          Object.hasOwn(rules.handlers, descriptor.handler),
          `Missing handler: ${service.id}/${name}`,
        );
        if (rules.rulesVersion === 1)
          requireValue(
            !(descriptor.outputModes || []).includes("stream"),
            "Rules v1 do not support streaming",
          );
        if (rules.rulesVersion === 2) {
          requireValue(
            (rules.handlers[descriptor.handler].protocol ===
              "openai-chat-completions" &&
              [
                "chat",
                "translate",
                "summarize",
                "detectLanguage",
                "parseImage",
                "recognizeText",
                "analyzeLayout",
                "dictionary",
                "suggest",
                "segmentSubtitle",
                "evaluate",
              ].includes(rules.handlers[descriptor.handler].task)) ||
              (rules.handlers[descriptor.handler].protocol ===
                "openai-audio-transcriptions" &&
                name === "transcribe") ||
              (rules.handlers[descriptor.handler].protocol ===
                "openai-audio-speech" &&
                name === "synthesizeSpeech"),
            `Unsupported protocol task: ${service.id}/${name}`,
          );
          requireValue(
            !(descriptor.outputModes || []).includes("stream") ||
              ["chat", "translate", "summarize", "dictionary"].includes(name),
            `Unsupported streaming task: ${name}`,
          );
          requireValue(
            rules.handlers[descriptor.handler].task === name,
            `Handler task mismatch: ${service.id}/${name}`,
          );
        }
      }
    }
  }
  return manifest;
}

function readPackageDirectory(folder) {
  const root = fs.realpathSync(folder);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
  );
  const files = {};
  let size = 0;
  for (const entry of packagePaths(manifest)) {
    const file = fs.realpathSync(path.join(root, entry));
    requireValue(
      file.startsWith(root + path.sep),
      "Package entry leaves directory: " + entry,
    );
    size += fs.statSync(file).size;
    requireValue(size <= 10 * 1024 * 1024, "Unpacked package exceeds 10 MiB");
    files[entry] = fs.readFileSync(file);
  }
  validatePackageFiles(files);
  return files;
}

function readPackageZip(bytes) {
  requireValue(bytes.byteLength <= 5 * 1024 * 1024, "Package exceeds 5 MiB");
  let size = 0,
    count = 0;
  const files = unzipSync(bytes, {
    filter: (entry) => {
      requireValue(
        safePath(entry.name) && ++count <= 100,
        "Invalid archive entry",
      );
      size += entry.originalSize;
      requireValue(size <= 10 * 1024 * 1024, "Unpacked package exceeds 10 MiB");
      return true;
    },
  });
  validatePackageFiles(files);
  return files;
}
module.exports = {
  packagePaths,
  validatePackageFiles,
  readPackageDirectory,
  readPackageZip,
};
