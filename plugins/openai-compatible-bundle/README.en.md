> Current development contract: Plugin API 1 (numeric `apiVersion: 1`), declarative rules use `format: "http"` or `"protocol"`. The legacy release notes below are historical and do not imply compatibility with legacy contracts.

# OpenAI Compatible Protocol Plugin

[English](README.en.md) | [简体中文](README.md)

2.0.3: Adopt SDK 2 (`apiVersion: "2"`), optimizing default prompts for translation, AI dictionary, and subtitle segmentation; host release versions are not treated as SDK capability dependencies. Existing instances obtain new snapshots via the existing upgrade flow; user-customized prompts maintain precedence.

2.0.2: Switched to [MIT License](../../LICENSE); release ZIP includes the full license text.

2.0.1: Removed timestamped ASR interface that had no preconfigured model; retained Chat and Translation, regular Speech Recognition, Speech Synthesis, and Full Image Recognition; unified interface names. Plugin ID is `openai-compatible-bundle`.

This is an official adapter plugin for [Plugin API 1](../../docs/plugin-development-guide.en.md), installable into current development branches containing the Provider runtime. Contains no API keys; fill in and save service configurations after creating instances.

The package includes four service interfaces:

| Interface | Implementation | Created Instance Capabilities |
| --------- | -------------- | ----------------------------- |
| chat-completions | services/chat.js | chat, translate, dictionary (complete / streaming), segmentSubtitle (complete) |
| transcriptions | services/transcription.json | transcribe |
| speech | services/speech.json | synthesizeSpeech |
| vision | services/vision.js | parseImage (full-text recognition, no coordinates) |

You can independently enable or disable `chat` / `translate` / `dictionary` / `segmentSubtitle` on instances; disabling `translate` hides "Translation Temperature" while retaining its value when re-enabled. Disabled capabilities do not enter profile or test candidates and cannot be called directly.

A single `chat-completions` instance can be reused across translation profiles and chat tests; profile calls specify `translate`/`chat` respectively and route to the corresponding handler without creating duplicate instances per capability. Create a second instance only when different models or accounts are needed.

`sharedSettings` only reduces form duplication; each instance maintains its own `baseUrl` and `apiKey`. The model field is required and supports predefined catalogs or custom inputs; text/vision catalogs include real model IDs defaulting to `gpt-6-luna`; custom IDs outside the catalog inherit service capabilities, and authors must ensure equivalent parameter and result protocols are supported. Chat and translation stream by default, which can be toggled off within the instance. The API base URL includes `/v1` and points to compatible services; compatibility across all endpoints and models is not guaranteed and must be verified individually.

1.4.0 exposes default prompts for translation and image recognition in the Manifest. In the Service Plugins page, expanding "Preview Prompts" allows read-only viewing and copying; service configuration retains "Plugin Internal Default" or custom prompt selections without rendering previews. When customization is needed, users create entities manually in Prompt Management. Explicitly specified task/profile prompts take precedence. Single-item text and aggregated JSON default declarations share standardized content with SDK modes and are validated by packaging scripts for consistency. Instances maintain independent snapshots without source editor boxes; plugin lists display network addresses, and service requests are bounded by snapshot declarations.

Text translation uses stable ID encoding/decoding; vision reads task assets to assemble data URLs, outputting full text with `poly=null` (cannot be used for inpainting requiring bounding boxes). Streaming examples require normal termination frames; truncations return errors. ASR does not declare timestamps. TTS uses `gpt-4o-mini-tts` and MP3, with 13 built-in voices in Manifest defaulting to `marin`, without relying on legacy host `tts-1` voice tables. Signed dictionary tutorial code has been moved to `../../examples/signed-dictionary` and is not included in this plugin.

## Real Model Catalog (1.6.0)

| Service | Recommended Models | Default |
| ------- | ------------------ | ------- |
| chat-completions, vision | gpt-6-luna, gpt-6.1-sol, gpt-6-astra | gpt-6-luna |
| transcriptions | gpt-transcribe | gpt-transcribe |
| speech | gpt-4o-mini-tts, gpt-4o-mini-tts-2025-12-15 | gpt-4o-mini-tts |

Verification date: 2026-10-10. References: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [Speech to Text](https://developers.openai.com/api/docs/guides/speech-to-text), [Speech Synthesis API](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create). This is the recommended catalog for current example endpoints; account permissions and third-party compatibility must be confirmed separately.

Text and vision continue to use Chat Completions. Luna (and custom gpt-6-sol) set `reasoning_effort=none`; Sol 6.1 and Astra set `low`; chat and translation do not send `temperature`. Therefore "Translation Temperature" is only active under `none` reasoning effort or legacy non-GPT-6 models. The example does not call tools and preserves stable IDs and streaming parsers.

ASR outputs JSON full text without requesting timestamps. TTS retains `/audio/speech`, MP3, and `speed` parameters; voices use this plugin's static catalog of 13 voices including `marin` and `cedar`. The official [TTS Guide](https://developers.openai.com/api/docs/guides/text-to-speech) recommends `marin` or `cedar`.

The official [Deprecations Record](https://developers.openai.com/api/docs/deprecations) lists retirement schedules for legacy Whisper/4o transcription and TTS snapshots, recommending Realtime models as subsequent replacements for some TTS; current `/audio/speech` reference still lists `gpt-4o-mini-tts`. This example is updated for the existing file synthesis endpoint and does not put Realtime session models into its catalog. Switching to Realtime requires implementing its respective protocol.

1.6.0 updates model catalog, default values, GPT-6 request parameters, and voices. Existing instances use independent snapshots and must be updated via the host instance upgrade flow; template updates will not overwrite existing configurations.

## Installation and Verification

In the official repository root, execute `npm ci`, `npm test`, `npm run build`. Install via KISS Translator "Service Plugins → Official Plugins", or import the generated standalone ZIP. Do not use the repository root URL as a single-plugin installation address.

The host uses general test cases to cover SDK protocol and streaming regression; mock responses cannot replace real service verification.

## GitHub Source Distribution

When installing via GitHub repository URLs, place the Manifest and implementation files of this directory into a dedicated repository root and commit complete executable files; do not use the entire kiss-translator repository as a plugin project. Installation reads default branch source code without reading Releases or running builds. Increment Manifest version when modifying executable content; restoration validates against recorded commit SHAs and content fingerprints.

## Translation Modes and Output Formats (1.6.1)

When aggregation is disabled, `text` format is used, translating one item per call. When aggregation is enabled, `json`, `line`, or `xml` is used based on the selected aggregation prompt, without reverting to `text` even when merged into a single item. HTTP requests still use Chat Completions, separate from translation format.

Default single-item prompt uses `{{text}}`; default aggregated prompt uses `{{segments}}`. `{{items}}` is always JSON with stable IDs; `{{segments}}` is encoded in the chosen format. User-bound templates retain original text; the SDK does not append conflicting format requirements.

Duplicate corresponding templates in "Prompt Management": single-item templates use single-item category; LINE/XML templates use aggregate category with the matching protocol, then bind them in service configuration or profiles.

| Format | System Prompt Output Requirement | User Prompt | Input / Output Example |
| ------ | -------------------------------- | ----------- | ---------------------- |
| text | Output translation only, no IDs, explanations, or Markdown fences | `{{text}}` | `Hello` → `Hello (translated)` |
| json | Output JSON array `{id,text}`, each ID exactly once | `{{segments}}` | `[{"id":"a","text":"Hello"}]` → `[{"id":"a","text":"你好"}]` |
| line | Output `ID \| Text`, each ID exactly once, keep `<br>` for internal newlines | `{{segments}}` | `a \| Hello` → `a \| 你好` |
| xml | Output `root/t` elements, keep `id`, escape XML entities, preserve internal newlines | `{{segments}}` | `<root><t id="a">Hello</t></root>` → `<root><t id="a">你好</t></root>` |

Here are the four reproducible default templates; `sourceLanguage`, `targetLanguage`, `glossary`, and `context` are supplied by the task:

```json
{
  "json": {
    "systemPrompt": "Translate the input items from {{sourceLanguage}} to {{targetLanguage}}. Return only a JSON array of {id,text}, keeping every ID. Glossary: {{glossary}}. Context: {{context}}",
    "userPrompt": "{{segments}}"
  },
  "text": {
    "systemPrompt": "Translate the source text from {{sourceLanguage}} to {{targetLanguage}}. Output only the translated text, without explanations or Markdown fences. Glossary: {{glossary}}. Context: {{context}}",
    "userPrompt": "{{text}}"
  },
  "line": {
    "systemPrompt": "Translate each input line from {{sourceLanguage}} to {{targetLanguage}}. Output only ID | Text lines, keeping every ID exactly once. Keep <br> for internal newlines. Do not output explanations or Markdown fences. Glossary: {{glossary}}. Context: {{context}}",
    "userPrompt": "{{segments}}"
  },
  "xml": {
    "systemPrompt": "Translate the text of each <t> element from {{sourceLanguage}} to {{targetLanguage}}. Output only <root><t id=\"ID\">Text</t></root>, keeping every ID exactly once. Escape XML entities and preserve internal newlines. Do not output explanations or Markdown fences. Glossary: {{glossary}}. Context: {{context}}",
    "userPrompt": "{{segments}}"
  }
}
```

New template version is 1.6.1. Installed instances retain their own snapshots; update the plugin package first, then create an upgraded instance, test, and replace profile references. Legacy snapshots without protocol declarations continue JSON compatibility; explicitly binding host prompts follows that prompt's mode and protocol. Custom scripts parsing responses must read `translationMode`/`outputProtocol`; legacy scripts using SDK helpers inherit the call protocol.

Current LLM service supports translation, chat (LLM), subtitle segmentation, and AI dictionary, sharing model and credential configurations. Requires a host supporting numeric Plugin API 1; legacy development instances should be recreated.
