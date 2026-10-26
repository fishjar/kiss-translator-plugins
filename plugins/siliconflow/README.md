# SiliconFlow 官方适配插件

1.1.2：拆分 Qwen 与星辰转写接口，分别声明无时间戳和分段时间戳；星辰请求分段时间戳。

1.1.1：插件改用 [MIT License](../../LICENSE)，发布 ZIP 附带许可证全文。

插件 ID：`siliconflow`，版本：`1.1.2`，要求宿主 SDK v1。由简约翻译项目维护，不代表 SiliconFlow 或模型提供商发布。

## 安装与配置

在简约翻译“接口插件 → 官方插件”安装 SiliconFlow，然后在“服务配置”添加需要的接口并填写 API Key。默认基础地址为 `https://api.siliconflow.cn/v1`；可修改为兼容服务地址，需自行确认模型与协议。每个服务实例独立保存地址、密钥、模型和实现快照。

| 接口                    | 默认模型                           | 能力                                 |
| ----------------------- | ---------------------------------- | ------------------------------------ |
| chat-completions        | deepseek-ai/DeepSeek-V4.1-Flash    | 聊天、单句及批量翻译，完整和流式输出 |
| transcriptions          | Qwen/Qwen3-ASR-1.7B                | 音频全文转写，不支持时间戳           |
| xingchen-transcriptions | XingChenAGI/XingChenASR-V3.2-Ultra | 音频转写，支持分段时间戳             |
| paddleocr               | PaddlePaddle/PaddleOCR-VL-1.5      | 图片／文档页面全文识别               |
| deepseek-ocr            | deepseek-ai/DeepSeek-OCR           | 图片／文档页面全文识别               |

模型字段支持手工输入其他模型 ID，但不同模型不一定支持相同协议。五个接口各预置一个模型，Qwen 与星辰的时间戳能力不同，分别提供独立接口。自定义模型的能力需要自行验证。

## 协议和能力边界

聊天与翻译使用 `/chat/completions`，沿用宿主的稳定翻译 ID、单句和聚合输出协议。默认提示词可在插件详情中预览；任务、场景及用户选择的提示词优先。推理参数使用供应商默认设置，不发送 DeepSeek 原厂的 `thinking` 字段，也不指定推理强度。

转写使用 `/audio/transcriptions`，以 multipart 上传音频文件 `file` 和模型 `model`。Qwen 仅返回文本，不支持本接口的详细时间戳格式；星辰额外发送 `response_format=verbose_json`，保留返回的分段 `segments`，无需粒度字段或宿主新增 multipart 功能。实测未获得词级时间戳。文档通用上传限制为 1 小时、50 MB；实际使用还受宿主任务预算及该模型限制约束，以更严格者为准。

ASR 接口的两个预置模型共用脚本，为没有扩展名的音频资产补充与 MIME 类型对应的文件名。实测无扩展名的上传文件名会导致星辰 WAV 返回 HTTP 400、Qwen M4A 返回 HTTP 500；补全 `.wav` 或 `.m4a` 后成功。两者均已实测 WAV（PCM16）和标准 M4A（AAC-LC），M4A 的 `audio/mp4`、`audio/x-m4a` 两种 MIME 类型都通过。M4A 是容器，其他编码尚未验证。

OCR 使用 `/chat/completions`，发送图片 data URL 与全文识别提示词，只等待完整响应。返回文本中的 Markdown 保持原样，结果格式为 `text`，识别项的 `poly` 为 `null`。默认提示词可预览、复制和通过宿主现有提示词设置覆盖。文档沿用宿主逐页转图片流程，不上传原生 PDF，不声明文字坐标，不支持图片擦除回填。

PaddleOCR 默认使用官方任务指令 `OCR:`；DeepSeek-OCR 使用 `Free OCR.`，通过脚本将图片置于提示词之前。两者均采用 `temperature: 0`。这些是根据真实请求修正的模型适配，不能用任意通用长提示词替代；覆盖默认提示词后需要自行验证识别效果。任务指令依据：[PaddleOCR-VL-1.5](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.5)、[DeepSeek-OCR](https://huggingface.co/deepseek-ai/DeepSeek-OCR)。

## 验证

项目根目录执行 `npm test`、`npm run build`，只需本仓库依赖。默认适配测试使用 SDK 测试替身。可选生产 SDK 集成测试执行 `npm run test:siliconflow`，需要旁边存在 `kiss-translator` 项目且已安装其依赖；也可用 `KISS_TRANSLATOR_ROOT` 指定宿主路径。测试使用模拟响应和任务资产，覆盖生产解析器、执行器、流式终止、翻译 ID、multipart 上传及 OCR 输出，不访问厂家推理服务。

接口依据：2026-10-26 的 [Chat Completions](https://api-docs.siliconflow.cn/docs/api/chat-completions-post) 与 [Audio Transcriptions](https://api-docs.siliconflow.cn/docs/api/audio-transcriptions-post)。模型 ID 按所选模型卡配置。转写文档的枚举未列出全部模型，Qwen 和星辰按通用 multipart 契约及真实请求验证。

1.0.0 的真实调用验证结果见 [ACCEPTANCE.md](ACCEPTANCE.md)；记录中的旧服务 ID 保留历史含义。1.1.0 合并接口和统一名称，协议实现不变，模拟回归通过不代表新版本已完成真实厂家复测。复测可在环境变量 `SILICONFLOW_API_KEY` 中提供自己的测试密钥，执行 `node plugins/siliconflow/tests/live.cjs <素材目录> <报告路径>`；素材目录包含 `speech.wav` 和 `ocr.png`。测试图片应包含两行文字：`Hello SiliconFlow` 与 `Invoice total: 123.45`；音频读出 `Hello. This is a speech recognition test. The number is one two three.`。密钥不写入报告。

1.1.0 将两个 ASR 服务合并为 `transcriptions`，保留两个预置模型；两个 OCR 因默认提示词和消息排列不同继续独立。

1.1.2 升级：现有服务实例保留配置快照，不自动改名或切换接口。Qwen 继续使用 `transcriptions`；星辰请升级插件后新建 `xingchen-transcriptions` 服务，并在字幕设置选择它。插件详情的“支持能力”按声明显示时间戳支持状态；未声明的插件显示未知。

时间戳不保证逐句：2026-10-27 使用实际 YouTube 英文音频补测，9.24 秒及 9.78 秒的两段录音均含多个句子，但星辰分别只返回一个 segment（0–7 秒、0–9.599 秒）。支持分段时间戳不等于每个句号都有边界；本插件不按字数伪造句内时间，未获得词级对齐时仍可能显示多句长字幕。
