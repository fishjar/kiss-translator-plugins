# Kimi Plugin

[English](README.en.md) | [简体中文](README.md)

1.0.0: Migrated from the built-in Kimi service in KISS Translator (fishjar/kiss-translator PR #1295) to a plugin using Plugin API 1 (numeric `apiVersion: 1`).

The plugin provides two services with the same capabilities. They differ in endpoint, API key type, and model catalog:

| Service                              | Key                       | Default base URL                 | Model catalog                                     |
| ------------------------------------ | ------------------------- | -------------------------------- | ------------------------------------------------- |
| Chat and translation (Kimi Code)     | Kimi Code membership key  | `https://api.kimi.com/coding/v1` | `kimi-for-coding` (default), `k3`, `k3.1-pro`     |
| Chat and translation (Open Platform) | Kimi open platform key    | `https://api.moonshot.cn/v1`     | `kimi-k2.6` (default), `kimi-k3`, `kimi-k3.1-pro` |

Both services provide `chat`, `translate`, `dictionary`, and `segmentSubtitle`, with complete results, streaming output, and batch translation aligned by stable IDs; subtitle segmentation uses complete responses only. Both services share one script: [services/chat.js](services/chat.js).

## Installation and Configuration

1. Install it from the official list under "Service Plugins", or use "Service Plugins → Import Folder" and select this directory (the root contains `manifest.json`).
2. In "Service Configuration → Add → Plugin Service", choose the Kimi Code or Open Platform service to match your key.
3. Enter the API key, choose a model, save, then verify with the capability test or a translation scene.

| Setting         | Default and notes                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| API base URL    | See the table above; the SDK appends `/chat/completions`, do not enter the full endpoint               |
| API Key         | Required; injected as Bearer by the host, the package contains no secret                              |
| Model           | See the table above; other model IDs can be entered manually                                          |
| Thinking Mode   | Disabled; options: API Default / Enable Thinking / Disable Thinking; API Default sends no thinking parameters |
| Thinking Effort | API Default; options: `low` / `high` / `max`; sent only when thinking is enabled and the model supports effort |

## Parameters by Model

Kimi models accept different thinking parameters and return 400 for values they do not accept, so the script picks parameters from the model ID:

| Model                                                 | Thinking disabled                                    | Thinking enabled                               |
| ----------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------- |
| `kimi-for-coding`, `k3`, `k3-256k`                    | `thinking: {type: "disabled"}`                       | `thinking: {type: "enabled"}`, optional effort |
| `k3.1-pro`, `k3.1-pro-highspeed`                      | Rejects disabled; sends `enabled` + `reasoning_effort: "low"` | `thinking: {type: "enabled"}`, optional effort |
| `kimi-k2.6`, `kimi-for-coding-highspeed`              | `thinking: {type: "disabled"}`                       | `thinking: {type: "enabled"}`, no effort       |
| `kimi-k3`, `kimi-k3.1-pro`, `kimi-k3.1-pro-highspeed` | Always thinks; sends `reasoning_effort: "low"`        | Sends only `reasoning_effort`, omitted for API Default |
| `kimi-k2.7-code`, `kimi-k2.7-code-highspeed`          | No thinking parameters                               | No thinking parameters                         |
| Other models                                          | No thinking parameters                               | No thinking parameters                         |

K-series models (IDs starting with `kimi-` or `k3`) use fixed sampling parameters and return 400 for `temperature` / `top_p`, so the plugin never sends them. It sends `max_completion_tokens: 16384` so reasoning does not use up the default output limit. Other models use the API's default sampling and output limits.

Complete chat results keep `reasoning_content` as `reasoning`; streaming chat emits `reasoning.delta` and `text.delta`. Translation parses only the final content, so reasoning never enters the translation.

## Prompts

Default prompts match the other official LLM plugins such as DeepSeek: single translation, batch translation (JSON), standard dictionary, and subtitle segmentation. Preview them on the plugin page, or switch to LINE / XML batch formats in prompt management.

## Verification

Run `npm ci`, `npm run check`, `npm test`, and `npm run build` in the repository root. `tests/kimi.test.cjs` uses SDK test doubles to cover per-model request parameters, streaming translation, and subtitle segmentation; `tests/kimi.host.test.cjs` needs the host source and runs with `npm run test:host`. Mock responses do not replace real service and browser acceptance.

## References

- [Kimi Code documentation](https://www.kimi.com/code/docs/)
- [Kimi open platform models](https://platform.kimi.com/docs/api/models-overview)
