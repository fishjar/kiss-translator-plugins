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

function checkModels(manifest, service) {
  const { allowCustomModel, models } = service;
  requireValue(
    allowCustomModel === undefined || typeof allowCustomModel === "boolean",
    "Invalid allowCustomModel",
  );
  if (models === undefined && allowCustomModel !== false) return;
  const modelField = service.modelField || "model";
  const field =
    service.settings?.find((setting) => setting?.key === modelField) ??
    manifest.sharedSettings?.find((setting) => setting?.key === modelField);
  requireValue(
    field?.type === "text" && !field.isSecret && Array.isArray(models) && models.length,
    "Models require a non-secret text model setting and a non-empty list",
  );
  requireValue(
    models.every((model) => typeof model?.id === "string" && model.id) &&
      new Set(models.map((model) => model.id)).size === models.length,
    "Invalid model definition",
  );
  for (const model of models)
    requireValue(
      model.capabilities === undefined,
      "Model capabilities must be declared on separate services: " + service.id,
    );
  requireValue(
    allowCustomModel !== false || field.defaultValue === undefined ||
      models.some((model) => model.id === field.defaultValue),
    "Default model must be in models",
  );
}

// This is the publisher's package check, not a copy of the host SDK/runtime.
function packagePaths(manifest) {
  requireValue(
    manifest.freeTier === undefined ||
      ["free", "quota-limited", "some-models", "time-limited"].includes(manifest.freeTier),
    "Invalid freeTier declaration",
  );
  requireValue(
    !Object.hasOwn(manifest, "manifestVersion") &&
      !Object.hasOwn(manifest, "rulesVersion") &&
      [1, 2].includes(manifest.apiVersion) &&
      /^[a-z][a-z0-9-]{1,100}$/.test(manifest.id) &&
      validVersion(manifest.version),
    "Invalid manifest identity/version",
  );
  requireValue(
    manifest.kind === undefined || manifest.kind === "provider",
    "Unsupported plugin kind",
  );
  requireValue(
    Array.isArray(manifest.services) && manifest.services.length,
    "Missing services",
  );
  const rewrite = manifest.permissions?.originRewrite;
  requireValue(
    rewrite === undefined || Array.isArray(rewrite),
    "Invalid Origin rewrite list",
  );
  for (const origin of rewrite || []) {
    let url;
    try {
      url = new URL(origin);
    } catch {
      throw new Error("Invalid Origin rewrite origin");
    }
    requireValue(
      typeof origin === "string" && url.origin === origin &&
        ["http:", "https:"].includes(url.protocol) &&
        !url.hostname.includes("*") &&
        manifest.permissions?.network?.includes(origin),
      "Origin rewriting must be a subset of fixed network origins",
    );
  }
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
    for (const [capability, descriptor] of Object.entries(service.capabilities)) {
      for (const feature of ["includesTranslation", "includesLayout"]) {
        requireValue(descriptor?.[feature] === undefined ||
          (capability === "parseImage" && typeof descriptor[feature] === "boolean"),
          "Invalid image feature declaration: " + feature);
      }
    }
    ids.add(service.id);
    checkModels(manifest, service);
    const promptCapabilities = {
      batch: "translate",
      nobatch: "translate",
      dictionary: "dictionary",
      subtitle: "segmentSubtitle",
      vlm: "parseImage",
      summary: "summarize",
      detectLanguage: "detectLanguage",
      suggest: "suggest",
      evaluate: "evaluate",
      recognizeText: "recognizeText",
      analyzeLayout: "analyzeLayout",
    };
    if (service.defaultPrompts !== undefined) {
      requireValue(
        service.defaultPrompts &&
          typeof service.defaultPrompts === "object" &&
          !Array.isArray(service.defaultPrompts),
        "Invalid defaultPrompts",
      );
      for (const [slot, prompts] of Object.entries(service.defaultPrompts)) {
        requireValue(
          service.capabilities[promptCapabilities[slot]] &&
            Array.isArray(prompts) &&
            prompts.length &&
            new Set(prompts.map((p) => p?.id)).size === prompts.length,
          "Invalid prompt array: " + slot,
        );
        for (const prompt of prompts) {
          requireValue(
            prompt &&
              !Array.isArray(prompt) &&
              typeof prompt.id === "string" &&
              /^[A-Za-z][\w-]*$/.test(prompt.id) &&
              typeof prompt.name === "string" &&
              prompt.name.trim() &&
              ["systemPrompt", "userPrompt"].some(
                (key) => typeof prompt[key] === "string",
              ) &&
              Object.entries(prompt).every(
                ([key, value]) =>
                  [
                    "id",
                    "name",
                    "nameI18n",
                    "description",
                    "descriptionI18n",
                    "systemPrompt",
                    "userPrompt",
                    "protocol",
                  ].includes(key) &&
                  (key.endsWith("I18n")
                    ? value &&
                      typeof value === "object" &&
                      !Array.isArray(value) &&
                      Object.values(value).every((v) => typeof v === "string")
                    : typeof value === "string"),
              ),
            "Invalid prompt preset: " + slot,
          );
          requireValue(
            prompt.protocol === undefined ||
              (slot === "batch"
                ? ["json", "line", "xml"].includes(prompt.protocol)
                : (slot === "vlm" && prompt.protocol === "image-json") ||
                  (slot === "nobatch" && prompt.protocol === "text")),
            "Invalid prompt protocol: " + slot,
          );
        }
      }
    }
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
        ["http", "protocol"].includes(rules.format) &&
          !Object.hasOwn(rules, "rulesVersion") &&
          !Object.hasOwn(rules, "manifestVersion") &&
          rules.handlers &&
          typeof rules.handlers === "object",
        "Invalid declarative rules: " + service.id,
      );
      require("./declarative-rules.cjs")(rules, [
        ...(manifest.sharedSettings || []),
        ...(service.settings || []),
      ]);
      for (const [name, descriptor] of Object.entries(service.capabilities)) {
        requireValue(
          Object.hasOwn(rules.handlers, descriptor.handler),
          `Missing handler: ${service.id}/${name}`,
        );
        if (rules.format === "http")
          requireValue(
            !(descriptor.outputModes || []).includes("stream"),
            "HTTP rules do not support streaming",
          );
        if (rules.format === "protocol") {
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
  const entries = packagePaths(manifest);
  if (fs.existsSync(path.join(root, "NOTICE")) && !entries.includes("NOTICE"))
    entries.push("NOTICE");
  for (const entry of entries) {
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
