> Current development contract: Plugin API 1 (numeric `apiVersion: 1`), declarative rules use `format: "http"` or `"protocol"`. The legacy release notes below are historical and do not imply compatibility with legacy contracts.

# OpenRouter Official Plugin

[English](README.en.md) | [简体中文](README.md)

1.2.0 (In development): Unified to numeric Plugin API 1, added Gemini / Qwen TTS and Jev decision services.

1.1.3: Adopt SDK 2 (`apiVersion: "2"`), optimizing default prompts for translation, AI dictionary, and subtitle segmentation; host release versions are not treated as SDK capability dependencies. Existing instances obtain new snapshots via the existing upgrade flow; user-customized prompts maintain precedence.

1.1.2: Enabled segment- and word-level timestamp requests for both ASR models, retaining timing information parsed by host SDK; verified with live API testing, see [ACCEPTANCE.md](ACCEPTANCE.md).

1.1.1: Switched to [MIT License](../../LICENSE); release ZIP includes the full license text.

Version: 1.2.0. Requires KISS Translator supporting Plugin API 1.

| Service | Default Model | Capabilities |
| ------- | ------------- | ------------ |
| Chat and Translation (LLM) | `openai/gpt-6-luna` | Chat, translation, subtitle segmentation, AI dictionary, streaming output |
| Speech Recognition (ASR) | `openai/whisper-large-v3-turbo` | Full text transcription, segment- and word-level timestamps |
| Gemini TTS | `google/gemini-3.8-flash-tts` | Synthesizes PCM into WAV; Flash Lite also supported |
| Qwen TTS Plus | `qwen/qwen-audio-3.0-tts-plus` | MP3 speech synthesis |
| Qwen TTS Flash | `qwen/qwen-audio-3.0-tts-flash` | MP3 speech synthesis |
| Decision Service (Jev) | `typesafe/jev-1.14` | Choice, Score, Noul |

After installing the plugin, add the required service instances under Service Configuration, then fill in and save your OpenRouter API Key.
Default API base URL is `https://openrouter.ai/api/v1`. Configurations for each instance are saved independently; no credentials are included in the package.
Model IDs can be modified manually, but protocol compatibility for other models and third-party services must be verified independently.

`transcriptions` preconfigures `openai/whisper-large-v3-turbo` and `qwen/qwen3-asr-0.6b`, defaulting to the former. Both models share the same script, reading audio bytes through task assets and calling `/audio/transcriptions` via JSON `input_audio.data` (raw Base64, not data URL) and `input_audio.format`.
Supports common audio MIME types for WAV, MP3, FLAC, M4A, Ogg, WebM, and AAC; format conversion is not performed in the plugin.
Optional language hints are converted to ISO-639-1; omitted when auto-detecting.
Transcription requests send `response_format: "verbose_json"` and `timestamp_granularities: ["segment", "word"]`. Both preconfigured models have been verified to return segment and word timestamps, so they share a single interface declaring `timestamps: true` without splitting by timestamp capabilities. The plugin retains SDK-parsed `segments`, word timestamps, and language; it does not declare streaming transcription, and does not estimate or fabricate timing.

In real video samples, Qwen returned only one segment but provided 30 word timestamps, allowing the host to segment further. Whisper's word timings sometimes exceed segment boundaries; the host retains segments and discards incompletely aligned word data; usable word timestamps are not guaranteed on every call. Qwen occasionally returns zero-duration words, requiring a host with zero-duration word retention fixes to prevent text loss.

Custom models and routing must support this verbose format and timestamp protocol; unverified models may reject requests. Existing instances retain legacy script snapshots and must be upgraded or re-added.

Protocol reference: [OpenRouter Speech to Text Documentation](https://openrouter.ai/docs/guides/overview/multimodal/stt).

## Speech Synthesis and Decisions

The two Gemini TTS models share 30 built-in voices defaulting to `Zephyr`. Qwen Plus uses `longanlingxin` / `longanlufeng`, Qwen Flash uses `loongjohn` / `longanhuan_v3.6`, each defaulting to the first option.
TTS calls `/audio/speech`, returns complete audio only, and does not send `speed`. Declarative fallback prioritizes call-level `input.voice`, falling back to the instance-configured voice when omitted. Gemini explicitly requests PCM, wrapped by the host as 24 kHz, mono, 16-bit little-endian WAV playable in browsers; Qwen explicitly requests MP3. Streaming playback, multi-speaker, and voice cloning are not provided.

Jev uses a dedicated `/api/alpha/decisions` endpoint rather than chat completions or prompt simulation. `decisionsBaseUrl` defaults to `https://openrouter.ai/api/alpha`, separate from the standard API base URL; this setting is a shared plugin setting saved per instance and only read by the decision service.
Uses declarative rules to pass `state` and `questions` directly; Choice only accepts non-empty object conditions such as `{"en":"Content is predominantly English","zh":"Content is predominantly Chinese"}`; keys are stable option identifiers and values are descriptions, where the result `choice` must be `en` or `zh`. Arrays, empty objects, and blank option keys are rejected before network requests, without automated conversions. Score and Noul preserve original structures. Initial version does not support Box or image decisions.
Returns vendor `model`, `answers`, and `usage`, without fabricating missing `confidence` or `action`. Requires a host supporting Plugin API 1; updating templates will not alter existing instances.

## Packaging

In the official plugin repository root, run:

```sh
npm ci
npm test
npm run build
```

Outputs to `dist/openrouter/1.2.0.zip` and `dist/catalog.json`.
The ZIP includes the Manifest, implementation files, and the repository root LICENSE. The catalog includes versions, capability summaries, download URLs, and ZIP SHA-256 hashes while retaining entries for other plugins.
Overwriting different contents under the same version is forbidden; identical inputs produce deterministic ZIPs.
Online URLs in the catalog are published to the official repository `dist` branch; local builds do not equal publication.
Installable over the network via KISS Translator "Service Plugins → Official Plugins", or by importing standalone ZIPs or plugin folders.

## Testing

Optional integration tests (`*.host.test.cjs`) use the real host ZIP loader, declarative executor, SDK, instance creation, and Sval script interpreter; HTTP and task audio assets use mock data.
Defaults to loading installed development dependencies and source code from an adjacent `kiss-translator` directory without modifying that project.
If the host is in another location, set `KISS_TRANSLATOR_ROOT` to its absolute path:

```powershell
$env:KISS_TRANSLATOR_ROOT = 'D:\code\kiss-translator'
npm run test:host
```

The above optional integration test command runs in the official plugin project root; `npm test` runs packaging regressions and standalone adapter tests using SDK test doubles, independent of host source code. Integration tests do not block standalone plugin publishing.

Tests cover three models, capability candidates, auth references, endpoints, Base64 encoding, audio formats, language parameters, transcription results, single/batch translation, stream completion/abort, and service errors.
Default automated tests do not access live OpenRouter; on 2026-10-28, real requests for four TTS models and Jev were verified via the production execution chain, with configuration, audio playback, and decisions validated in a real Chrome extension (details in [ACCEPTANCE.md](ACCEPTANCE.md)). Historical test records for chat, translation, and two ASR models are preserved.
Live acceptance requires installing the package in the extension, creating three instances, and testing chat, translation, and short speech recognition across both models using valid user credentials.

1.1.0 merged two ASR services into `transcriptions`, retaining two preconfigured models and custom model input; unified interface names. Multiple independent model instances can be created from the same interface for debugging.

Current LLM service supports translation, chat (LLM), subtitle segmentation, and AI dictionary, sharing model and credential configurations. Requires a host supporting numeric Plugin API 1; legacy development instances should be recreated.
