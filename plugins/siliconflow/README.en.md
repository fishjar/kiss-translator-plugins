> Current development contract: Plugin API 1 (numeric `apiVersion: 1`), declarative rules use `format: "http"` or `"protocol"`. The legacy release notes below are historical and do not imply compatibility with legacy contracts.

# SiliconFlow Official Adapter Plugin

[English](README.en.md) | [简体中文](README.md)

1.1.4: Adopt SDK 2 (`apiVersion: "2"`), optimizing default prompts for translation, AI dictionary, and subtitle segmentation; host release versions are not treated as SDK capability dependencies. Existing instances obtain new snapshots via the existing upgrade flow; user-customized prompts maintain precedence.

1.1.3: Unified capabilities at the interface layer, removing duplicate declarations at the model layer; interface names distinguish only Qwen and XingChen, with timestamp support displayed under supported capabilities.

1.1.1: Switched to [MIT License](../../LICENSE); release ZIP includes the full license text.

Plugin ID: `siliconflow`, Version: `1.1.4`, requires a host supporting numeric Plugin API 1. Maintained by the KISS Translator project, not endorsed or published by SiliconFlow or model providers.

## Installation and Configuration

Install SiliconFlow from KISS Translator "Service Plugins → Official Plugins", then add needed interfaces under "Service Configuration" and fill in your API Key. Default base URL is `https://api.siliconflow.cn/v1`; can be modified to compatible service endpoints, with models and protocols verified independently. Each service instance independently saves its URL, secret, model, and implementation snapshot.

| Interface | Default Model | Capabilities |
| --------- | ------------- | ------------ |
| chat-completions | deepseek-ai/DeepSeek-V4.1-Flash | Chat, translation, AI dictionary (complete and streaming), subtitle segmentation (complete) |
| transcriptions | Qwen/Qwen3-ASR-1.7B | Speech recognition, no timestamp support |
| xingchen-transcriptions | XingChenAGI/XingChenASR-V3.2-Ultra | Speech recognition, segment timestamps supported |
| paddleocr | PaddlePaddle/PaddleOCR-VL-1.5 | Full-image recognition for images / document pages |
| deepseek-ocr | deepseek-ai/DeepSeek-OCR | Full-image recognition for images / document pages |

The model field supports manual entry of other model IDs, though different models do not necessarily support identical protocols. The five interfaces each preconfigure one model; Qwen and XingChen have different timestamp capabilities and provide separate interfaces. Custom model capabilities must be verified independently.

## Protocols and Capability Boundaries

Chat and translation use `/chat/completions`, following host protocols for stable translation IDs, single-item, and aggregated output. Default prompts can be previewed in plugin details; task, profile, and user-selected prompts take precedence. Reasoning parameters use vendor default settings, omitting DeepSeek original `thinking` fields and reasoning effort.

Transcription uses `/audio/transcriptions`, uploading `file` and `model` via multipart. Qwen returns text only and does not support detailed timestamp formats; XingChen additionally sends `response_format=verbose_json`, retaining returned `segments` without requiring granularity parameters or new host multipart features. Live testing did not obtain word-level timestamps. General documented upload limit is 1 hour and 50 MB; actual usage is also bounded by host task budgets and model limits, whichever is stricter.

Both preconfigured models in the ASR interface share a script that appends file extensions matching MIME types to extension-less audio assets. Live testing showed extension-less upload filenames cause XingChen WAV to return HTTP 400 and Qwen M4A to return HTTP 500; appending `.wav` or `.m4a` resolves the issue. Both have been verified with WAV (PCM16) and standard M4A (AAC-LC); M4A passes with both `audio/mp4` and `audio/x-m4a` MIME types. M4A is a container format; other codecs have not been verified.

OCR uses `/chat/completions`, sending image data URLs with full-text recognition prompts, awaiting complete responses only. Returned Markdown text is preserved, result format is `text`, and item `poly` is `null`. Default prompts can be previewed, copied, and overridden via host prompt settings. Document workflows follow host page-by-page rasterization without uploading native PDFs, declaring coordinates, or supporting image inpainting.

PaddleOCR defaults to official task instruction `OCR:`; DeepSeek-OCR uses `Free OCR.`, placing the image before the prompt via script. Both use `temperature: 0`. These are model adaptations tuned against real requests and cannot be replaced by arbitrary generic long prompts; overriding default prompts requires verifying recognition accuracy. Instruction sources: [PaddleOCR-VL-1.5](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.5), [DeepSeek-OCR](https://huggingface.co/deepseek-ai/DeepSeek-OCR).

## Verification

In the repository root, run `npm test` and `npm run build`, requiring only this repository's dependencies. Default adapter tests use SDK test doubles. Optional production SDK integration tests run via `npm run test:siliconflow`, requiring an adjacent `kiss-translator` directory with installed dependencies (or specify path via `KISS_TRANSLATOR_ROOT`). Tests use mock responses and task assets, covering production parsers, executors, stream termination, translation IDs, multipart uploads, and OCR output without accessing live vendor endpoints.

API references (dated 2026-10-26): [Chat Completions](https://api-docs.siliconflow.cn/docs/api/chat-completions-post) and [Audio Transcriptions](https://api-docs.siliconflow.cn/docs/api/audio-transcriptions-post). Model IDs configured according to model cards. Transcription docs do not enumerate all models; Qwen and XingChen were verified against standard multipart contracts and real requests.

Live verification results for 1.0.0 are in [ACCEPTANCE.md](ACCEPTANCE.md); legacy service IDs in records retain historical meanings. 1.1.0 merged interfaces and unified naming with unchanged protocol implementations; passing mock regressions does not imply new versions have completed live vendor re-testing. Re-testing can supply a test key via `SILICONFLOW_API_KEY` environment variable and run `node plugins/siliconflow/tests/live.cjs <assets_dir> <report_path>`; assets dir contains `speech.wav` and `ocr.png`. Test image should contain two lines: `Hello SiliconFlow` and `Invoice total: 123.45`; audio reads `Hello. This is a speech recognition test. The number is one two three.`. Keys are not written to reports.

1.1.0 merged two ASR services into `transcriptions`, retaining two preconfigured models; the two OCR services remain separate due to different default prompts and message ordering.

1.1.2 upgrade: Existing service instances retain configuration snapshots and do not automatically rename or switch interfaces. Qwen continues using `transcriptions`; for XingChen, upgrade the plugin, create a new `xingchen-transcriptions` service, and select it in subtitle settings. "Supported Capabilities" in plugin details displays timestamp status according to declarations; undeclared plugins show unknown.

Timestamps do not guarantee sentence-by-sentence granularity: live tests on 2026-10-27 with real YouTube English audio (9.24s and 9.78s clips containing multiple sentences) returned only one segment each from XingChen (0–7s and 0–9.599s). Segment timestamp support does not mean every sentence boundary is marked; this plugin does not fabricate intra-sentence timestamps based on character counts, and long subtitles spanning multiple sentences may still appear without word-level alignment.

Current LLM service supports translation, chat (LLM), subtitle segmentation, and AI dictionary, sharing model and credential configurations. Requires a host supporting numeric Plugin API 1; legacy development instances should be recreated.
