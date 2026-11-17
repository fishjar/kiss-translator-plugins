const testVlmDefaults = require("../../../tests/support/vlm-defaults.cjs");

for (const [plugin, service] of [
  ["deepseek", "vision"],
  ["llama-cpp", "vision"],
  ["ollama", "vision"],
  ["openai-compatible-bundle", "vision"],
  ["qianwen", "ocr"],
  ["qianwen", "omni"],
]) testVlmDefaults(plugin, service);
