# LLaMA.cpp

[English](README.en.md) | [简体中文](README.md)

A KISS Translator adapter for a running LLaMA.cpp server using the OpenAI-compatible protocol.

| Service | Capabilities | Preset model |
| --- | --- | --- |
| Chat and translation (LLM) | Chat, translation, AI dictionary, subtitle segmentation | `Qwen3.8-27B` |
| Image text recognition (VLM) | Vision parsing, image text recognition | `Qwen3.8-27B` |

## Configuration

- The API base URL defaults to `http://127.0.0.1:8080/v1`. Change it to an HTTP/HTTPS endpoint, such as `http://192.168.6.138:8088/v1`. Include the server's API path (usually `/v1`); the plugin appends `/chat/completions`.
- API Key is optional. Empty keys omit the authorization header; provided keys use Bearer authentication. HTTP endpoints and empty keys require an updated host supporting these features.
- Both services default to `Qwen3.8-27B` and accept custom model names. The submitted name must match the server configuration.
- VLM requires the server to load a model supporting image input and its required components. A preset name does not enable vision on the server.

LLM supports complete and streaming chat, translation, and dictionary responses. Subtitle segmentation requires a complete response. VLM uses the OpenAI-compatible image request and recognition prompts, defaulting to plain text paragraphs with a separate Document to Markdown option, without fabricated text coordinates. Model downloads, server startup, ASR, and TTS are outside this plugin.

Maintained by KISS Translator; not published or endorsed by the LLaMA.cpp project. See [assets/SOURCES.md](assets/SOURCES.md) for icon provenance.
