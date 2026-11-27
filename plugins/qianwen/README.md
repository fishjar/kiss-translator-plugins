# 千问 AI

[English](README.en.md) | 简体中文

在简约翻译的「接口插件」页面安装千问 AI，或导入构建生成的 ZIP。然后在「接口」页面添加所需服务，填写千问 AI 平台的按量 API Key。各服务实例单独保存配置。 [获取 API Key](https://platform.qianwenai.com/docs/api-reference/preparation/api-key)

| 服务 | 模型 | 用途 |
| --- | --- | --- |
| 对话与翻译（LLM） | `qwen3.8-flash`、`qwen3.8-max` | Flash 为默认模型。支持文本和图片对话、单条与聚合翻译、AI 词典和字幕断句。对话、翻译、词典支持流式，思考默认关闭。 |
| 文本翻译（Qwen-MT-Uni） | `qwen-mt-uni` | 同步单条和聚合文本翻译，可用于网页和文件工作台提取的文本。 |
| 语音识别（带时间戳） | `qwen-audio-3.1-asr-flash` | 短音频转写，返回句级时间戳，并在有效时保留厂商的词级时间戳。优先用于 YouTube 字幕对齐。 |
| 图片全文识别 | `qwen3.5-ocr` | 提取截图和扫描页中的文字。 |
| 多模态识别 | `qwen3.8-omni-flash` | 图片全文识别和无时间戳的短音频转写。YouTube 字幕由宿主按音频块对齐。 |

对话、图片和 Omni 使用 OpenAI 兼容 Chat Completions。带时间戳的 ASR 使用千问的原生 HTTP 接口。WAV 和宿主重新封装的 AAC-LC M4A 已实测。专用 ASR 遇到纯静音可能返回 HTTP 400，Omni 在本次静音样本中返回空转写。 [专用 ASR](https://platform.qianwenai.com/docs/api-reference/speech-recognition/qwen-audio-asr/http-api) · [Omni](https://platform.qianwenai.com/docs/developer-guides/speech/multimodal-speech)

各服务均可修改 API 基础地址（支持 HTTP/HTTPS）。对接无需鉴权的自定义接口或代理时，API Key 可留空。对话、图片、Omni 和带时间戳 ASR 支持手填模型 ID。对话、图片和 Omni 默认使用 `https://maas.qianwenaiapi.com/compatible-mode/v1`。带时间戳 ASR 和 Qwen-MT-Uni 默认使用 `https://maas.qianwenaiapi.com/api/v1`。各服务在基础地址后追加相应接口路径。

在「接口」添加「文本翻译（Qwen-MT-Uni）」，再在翻译场景中选择该服务。使用默认地址时，填写千问 AI 平台 API Key。模型固定为 `qwen-mt-uni`。支持的源语言和目标语言组合以官方语向表为准。遇到需要保留内联格式的网页段落时，关闭富文本翻译后重试。该服务提交文本段落，整文件上传和异步翻译不在此服务范围内。 [Qwen-MT-Uni API 与语向表](https://platform.qianwenai.com/docs/api-reference/multimodal-translation/qwen-mt-uni/translate)

图片全文识别和多模态识别均可在插件列表预览提示词，并在服务配置中切换。默认是「纯文本识别」，两者都可选文档转 Markdown 和表格提取。专用 OCR 另有公式提取（LaTeX），Omni 另有图表解析和图片描述。已有服务实例可升级到新版模板。

图片服务接收单张图片并返回全文，扫描 PDF 由宿主逐页转图后提交。发布范围为按量 API、图片全文识别和短音频转写。详见[验收记录](ACCEPTANCE.md)。
