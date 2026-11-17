# Ollama

[English](README.en.md) | [简体中文](README.md)

由简约翻译维护的 Ollama 服务适配插件，通过 OpenAI 兼容协议连接已运行的服务。

| 服务接口 | 支持能力 | 预定义模型 |
| --- | --- | --- |
| 对话与翻译（LLM） | 对话、翻译、AI 词典、字幕断句 | `gemma4:12b` |
| 图片全文识别（VLM） | 视觉解析、图片全文识别 | `gemma4:12b` |

## 配置

- API 基础地址默认为 `http://127.0.0.1:11434/v1`，可修改为 HTTP/HTTPS 地址，例如 `http://192.168.6.138:8088/v1`。需要保留服务的 API 路径（通常为 `/v1`），插件会追加 `/chat/completions`。
- API Key 可留空；留空时不发送鉴权头，填写后使用 Bearer 鉴权。HTTP 和空 Key 需要支持这些功能的新版宿主。
- 请先在 Ollama 服务端运行 `ollama pull gemma4:12b` 安装模型，并启动 Ollama 服务。
- 两个服务的默认模型均为 `gemma4:12b`，可填写其他模型名；实际发送的模型名应与服务端配置一致。
- VLM 需要服务端加载支持图片输入的模型及其所需组件。预定义模型名称不代表服务端已经启用视觉能力。

LLM 支持普通和流式对话、翻译与词典结果；字幕断句使用完整响应。VLM 沿用 OpenAI 兼容协议的图片请求与识别提示词，默认返回纯文本段落，可另选文档转 Markdown，不生成文字坐标。插件不包含模型下载、服务启动、ASR 或 TTS。

本插件由简约翻译维护，不代表 Ollama 项目发布或背书。图标来源见 [assets/SOURCES.md](assets/SOURCES.md)。

接口参考：[Ollama OpenAI 兼容文档](https://docs.ollama.com/api/openai-compatibility)。本地 Ollama 通常无需 Key；使用需要鉴权的代理或云端地址时填写相应 Key。
