> 当前开发契约：插件 API 1（数字 `apiVersion: 1`），声明式规则使用 `format: "http"` 或 `"protocol"`。下方旧版发布说明为历史，不表示兼容旧契约。

# OpenRouter 官方插件

[English](README.en.md) | [简体中文](README.md)

1.2.0（开发中）：统一为数字版插件 API 1，新增 Gemini / Qwen TTS 和 Jev 决策服务。

1.1.3：采用 SDK 2（apiVersion:"2"），优化翻译、AI 词典与字幕断句默认提示词；宿主发布版本号不作为 SDK 功能依赖。旧实例通过现有升级流程获取新快照，用户自定义提示词保持优先。


1.1.2：两个 ASR 模型启用分段及词级时间戳请求，保留宿主 SDK 解析后的时间信息；已完成真实 API 补测，见 [ACCEPTANCE.md](ACCEPTANCE.md)。

1.1.1：插件改用 [MIT License](../../LICENSE)，发布 ZIP 附带许可证全文。

版本：1.2.0。需要支持插件 API 1 的 KISS Translator。

| 服务       | 默认模型                        | 能力                               |
| ---------- | ------------------------------- | ---------------------------------- |
| 对话与翻译（LLM） | `openai/gpt-6-luna`             | 对话、翻译、字幕断句、AI 词典、流式输出 |
| 语音识别（ASR） | `openai/whisper-large-v3-turbo` | 完整文本转写，分段及词级时间戳     |
| Gemini TTS | `google/gemini-3.8-flash-tts` | PCM 合成为 WAV；也支持 Flash Lite |
| Qwen TTS Plus | `qwen/qwen-audio-3.0-tts-plus` | MP3 语音合成 |
| Qwen TTS Flash | `qwen/qwen-audio-3.0-tts-flash` | MP3 语音合成 |
| 决策服务（Jev） | `typesafe/jev-1.14` | Choice、Score、Noul |

安装插件后，在服务配置中分别添加所需服务实例，填写并保存自己的 OpenRouter API Key。
默认 API 基础地址为 `https://openrouter.ai/api/v1`。各实例的配置独立保存；包中不包含凭据。
模型 ID 可手动修改，但其他模型及兼容服务的协议支持需要自行验证。

`transcriptions` 预置 `openai/whisper-large-v3-turbo`、`qwen/qwen3-asr-0.6b`，默认使用前者。两个模型共用同一脚本，通过任务资产读取音频字节，以 JSON `input_audio.data`（原始 Base64，非 data URL）和 `input_audio.format` 调用 `/audio/transcriptions`。
支持 WAV、MP3、FLAC、M4A、Ogg、WebM 和 AAC 的常见音频 MIME；不在插件内转换格式。
可选语言提示转换为 ISO-639-1，自动识别时不发送语言字段。
转写请求发送 `response_format: "verbose_json"` 和 `timestamp_granularities: ["segment", "word"]`。两个预置模型均已实测返回分段和词级时间戳，因此共用一个声明 `timestamps: true` 的接口，无需按时间戳能力拆开。插件保留 SDK 解析出的 `segments`、词时间戳和语言；不声明流式转写，不估算或伪造时间。

Qwen 在实际视频样本中只返回一个分段，但提供 30 个词时间点，宿主可据此进一步断句。Whisper 的词时间有时超出其分段边界，宿主会保留分段并丢弃不完整对齐的词数据；不能保证每次调用都得到可用词时间戳。Qwen 偶尔返回零时长词，需使用包含零时长词保留修复的宿主，避免文字丢失。

自定义模型及其他路由必须支持此详细格式与时间戳协议，未验证模型可能拒绝请求。已有实例保留旧脚本快照，需要升级实例或重新添加服务后生效。

协议参考：[OpenRouter 转写文档](https://openrouter.ai/docs/guides/overview/multimodal/stt)。

## 语音合成与决策

Gemini TTS 的两个模型共用 30 种预置音色，默认 Zephyr；Qwen Plus 使用 longanlingxin / longanlufeng，Qwen Flash 使用 loongjohn / longanhuan_v3.6，各自默认第一种。
TTS 调用 `/audio/speech`，只返回完整音频，不发送 speed。通过声明式字段回退优先使用本次调用的 `input.voice`，未提供时使用实例配置的音色。Gemini 显式请求 PCM，由 宿主按 24 kHz、单声道、16-bit little-endian 封装为浏览器可播放的 WAV；Qwen 显式请求 MP3。不提供流式播放、多说话人或声音克隆。

Jev 使用专用 `/api/alpha/decisions` 端点，不使用聊天补全或提示词模拟决策。`decisionsBaseUrl` 默认 `https://openrouter.ai/api/alpha`，独立于普通 API 基础地址；该字段是插件共享设置，各实例独立保存，仅决策服务读取它。
使用声明式规则直接发送 state 和 questions；Choice 只接受非空对象条件，例如 `{"en":"内容主要使用英语","zh":"内容主要使用中文"}`；键是稳定的选项标识，值是判断描述，结果 choice 必须为 en 或 zh。数组、空对象和空白选项键在联网前拒绝，不提供自动转换。Score 和 Noul 保持原结构。首版不支持 Box 或图片决策。
返回厂家 model、answers 和 usage，不补造缺失的 confidence 或 action。宿主需要支持插件 API 1；更新模板不自动改写已有实例。

## 打包

在官方插件项目根目录执行：

```sh
npm ci
npm test
npm run build
```

输出到 `dist/openrouter/1.2.0.zip` 和 `dist/catalog.json`。
ZIP 包含 Manifest、实现文件和根目录的 LICENSE。目录包含版本、能力摘要、下载地址及 ZIP SHA-256，并保留其他插件条目。
同版本的不同内容禁止覆盖；相同输入生成相同 ZIP。
目录中的线上地址约定发布至官方仓库 `dist` 分支，执行本地打包不等于已发布。
可通过 KISS Translator 的“接口插件 → 官方插件”联网安装，或导入独立 ZIP／插件文件夹。

## 测试

可选集成测试（`*.host.test.cjs`）使用当前宿主的真实 ZIP 加载器、声明式执行器、SDK、实例创建和 Sval 脚本解释器；HTTP 和任务音频资产使用模拟数据。
默认从相邻 `kiss-translator` 项目加载已安装的开发依赖及源码，不修改该项目。
若宿主在其他位置，设置 `KISS_TRANSLATOR_ROOT` 为其绝对路径：

```powershell
$env:KISS_TRANSLATOR_ROOT = 'D:\code\kiss-translator'
npm run test:host
```

以上可选集成测试命令在官方插件项目根目录执行；`npm test` 运行打包回归和使用 SDK 测试替身的独立适配测试，不依赖宿主源码。集成测试不阻止插件独立发布。

测试覆盖三种模型、能力候选、鉴权引用、端点、Base64 编码、音频格式、语言参数、转写结果、单句/批量翻译、流式结束/截断和服务错误。
默认自动测试不访问真实 OpenRouter；2026-10-28 已通过生产执行链完成四种 TTS 与 Jev 的真实请求，并在真实 Chrome 扩展中验证配置、音频播放及决策，详情见 [ACCEPTANCE.md](ACCEPTANCE.md)。此前聊天、翻译和两个 ASR 的实测保留历史记录。
真实验收需在扩展中安装包、创建三个实例，并使用用户自行配置的有效凭据分别测试聊天、翻译及两种模型的短语音识别。

1.1.0 将两个 ASR 服务合并为 `transcriptions`，保留两个预置模型和自定义模型输入；统一接口功能名称。可从同一接口创建多个独立模型实例分别调试。

当前 LLM 服务支持翻译、对话（LLM）、字幕断句和 AI 词典，共用模型与凭据配置。当前需要支持数字版插件 API 1 的宿主；旧开发实例需重新创建。
