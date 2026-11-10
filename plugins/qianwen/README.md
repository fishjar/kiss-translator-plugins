# 千问 AI

[English](README.en.md) | 简体中文

在简约翻译的「接口插件」页面安装千问 AI，或导入构建生成的 ZIP。然后在「接口」页面添加所需服务，填写千问 AI 平台的按量 API Key。各服务实例单独保存配置。 [获取 API Key](https://platform.qianwenai.com/docs/api-reference/preparation/api-key)

| 服务 | 模型 | 用途 |
| --- | --- | --- |
| 对话与翻译（LLM） | `qwen3.8-flash`、`qwen3.8-max` | Flash 为默认模型。支持文本和图片对话、单条与聚合翻译、AI 词典和字幕断句。对话、翻译、词典支持流式，思考默认关闭。 |
| 语音识别（带时间戳） | `qwen-audio-3.1-asr-flash` | 短音频转写，返回句级时间戳，并在有效时保留厂商的词级时间戳。优先用于 YouTube 字幕对齐。 |
| 图片全文识别 | `qwen3.5-ocr` | 提取截图和扫描页中的文字。 |
| 多模态识别 | `qwen3.8-omni-flash` | 图片全文识别和无时间戳的短音频转写。YouTube 字幕由宿主按音频块对齐。 |

对话、图片和 Omni 使用 OpenAI 兼容 Chat Completions。带时间戳的 ASR 使用千问的原生 HTTP 接口。WAV 和宿主重新封装的 AAC-LC M4A 已实测。专用 ASR 遇到纯静音可能返回 HTTP 400，Omni 在本次静音样本中返回空转写。 [专用 ASR](https://platform.qianwenai.com/docs/api-reference/speech-recognition/qwen-audio-asr/http-api) · [Omni](https://platform.qianwenai.com/docs/developer-guides/speech/multimodal-speech)

图片服务接收单张图片并返回全文，扫描 PDF 由宿主逐页转图后提交。发布范围为按量 API、图片全文识别和短音频转写。详见[验收记录](ACCEPTANCE.md)。
