> Current development contract: Plugin API 1 (numeric `apiVersion: 1`), declarative rules use `format: "http"` or `"protocol"`. The legacy release notes below are historical and do not imply compatibility with legacy contracts.

# DeepSeek Plugin

[English](README.en.md) | [简体中文](README.md)

1.2.5: Adopt SDK 2 (`apiVersion: "2"`), optimizing default prompts for translation, AI dictionary, and subtitle segmentation; host release versions are not treated as SDK capability dependencies. Existing instances obtain new snapshots via the existing upgrade flow; user-customized prompts maintain precedence.

1.2.4: Switched to [MIT License](../../LICENSE); release ZIP includes the full license text.

1.2.3: Unified interface name to "Chat and Translation"; model names remain in the model catalog.

1.2.2: Migrated from host project to official plugins repository; display name removed "Example"; plugin ID is `deepseek`; service IDs preserved.

This is a standalone JSON declarative example for [Plugin API 1](../../docs/plugin-development-guide.en.md) using rules with `format: "protocol"`, designed for current development branches supporting this version. A single `chat-completions` service instance provides both `chat` and `translate`, supporting complete results, streaming output, and batch translation aligned by stable IDs. The implementation is in [services/chat.json](services/chat.json); the package contains no JS entry points.

## Installation and Configuration

1. In "Service Plugins → Import Folder", select this directory (the directory root directly contains `manifest.json`). You can also compress this directory into a ZIP (ensuring `manifest.json` is at the ZIP root) and import the ZIP.
2. Check the network address in the plugin list, then in "Service Configuration → Add → Plugin Service", select "Chat and Translation".
3. Fill in your DeepSeek API Key, select a model, and save; select this instance in translation profiles, or test chat and translation in capability tests. "Quick Translation Test" can directly verify unsaved configurations without auto-saving.

| Setting | Default & Description |
| ------- | --------------------- |
| API Base URL | `https://api.deepseek.com`; the SDK appends `/chat/completions`, do not enter the full endpoint |
| API Key | Required; injected as Bearer by host broker, package contains no secret |
| Model | `deepseek-flash`; catalog also includes `deepseek-v4-pro`, manual input of compatible model IDs is allowed |
| Thinking Mode | Disabled; options: Service Default / Enable Thinking / Disable Thinking; default omits thinking parameters |
| Thinking Effort | `high`; options: Service Default / `low` / `high` / `max`; sent only when thinking mode is enabled and a specific effort is selected |
| Translation Temperature | `0`; displayed only when translation is enabled, sent only when thinking mode is disabled; not set for chat |

This example is implemented for text input and does not declare image, audio, or tool-calling capabilities. The model catalog only represents the capability scope of this example, not the vendor's full capability list. Complete chat results retain `reasoning_content` as `reasoning`, streaming chat outputs `reasoning.delta` and `text.delta`; translation only parses final content text to prevent reasoning tokens from mixing into translations.

Translation reuses the SDK's mode-mapped prompts and encoding/decoding without forcing `response_format=json_object`. Non-aggregated translation outputs plain text; aggregated translation uses JSON, LINE, or XML according to the selected prompt. Manifest exposes default single-item text and aggregated JSON prompts, verified by tests to match SDK default templates. Streaming translation converts content to `item.delta` / `item.complete`; final validation verifies normal completion and all input IDs; missing items, duplicate IDs, API errors, and stream aborts will cause failure.

JSON selects `openai-chat-completions` protocol and `chat` / `translate` tasks; the host constructs requests, expands prompts, and parses complete or streaming responses. `$if` supports boolean configurations and `equals` comparisons on select configs; branches are omitted when unmatched. Network passes through host Broker, credentials are referenced via `$secret`, and no user scripts are executed. Instances retain independent configuration and implementation snapshots; existing instances must first manually update the 1.2.1 template, then upgrade via the standard workflow; old instances are not modified automatically. ZIP only includes Manifest and JSON, which are local build artifacts not committed to Git.

## Installation and Verification

In the official repository root, execute `npm ci`, `npm test`, `npm run build`. Install via KISS Translator "Service Plugins → Official Plugins", or import the generated standalone ZIP. Do not use the repository root URL as a single-plugin installation address.

Host fixed-fixture tests cover protocol and streaming regression; mock responses cannot replace real service verification.

## Official References

Documentation verification date: 2026-10-10. Models and parameters may change; refer to official documentation in use.

- [First API Call](https://api-docs.deepseek.com/): Base URL, Bearer authentication, and current model names.
- [Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/): Request parameters, response structures, and SSE termination markers.
- [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/): Toggle, effort, and temperature behavior during thinking mode.

## Translation Modes and Output Formats (1.2.1)

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

New template version is 1.2.1. Installed instances retain their own snapshots; update the plugin package first, then create an upgraded instance, test, and replace profile references. Legacy snapshots without protocol declarations continue JSON compatibility; explicitly binding host prompts follows that prompt's mode and protocol. Custom scripts parsing responses must read `translationMode`/`outputProtocol`; legacy scripts using SDK helpers inherit the call protocol.

Current LLM service supports translation, chat (LLM), subtitle segmentation, and AI dictionary, sharing model and credential configurations. Requires a host supporting numeric Plugin API 1; legacy development instances should be recreated.
