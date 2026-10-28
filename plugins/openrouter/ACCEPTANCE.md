> 历史验收：本文中的 SDK 3 是旧开发契约名称，不是当前插件 API 版本。当前已统一为数字版插件 API 1，以下结果不代表新契约的验收结果；参见[当前 API 1 验收记录](../../docs/plugin-api-1-acceptance.md)。保留历史名称以区分测试所用契约。

# OpenRouter 1.2.0 / SDK 3 验收记录

日期：2026-10-28。以下结果来自本次未提交源码与本地构建，不代表已发布。密钥不写入源码、报告或插件包。

## Code review 修复复验

TTS 实现现已改为 `services/speech-pcm.js` / `services/speech-mp3.js`，优先使用 `input.voice`，缺省时回退到实例配置；SDK 3 的 PCM 封装拒绝大端 `audio/L16`。新增回归先在修复前失败，修复后通过。宿主音频／传输／脚本集成 29 项、OpenRouter 宿主集成 23 项、插件包／协议 34 项及插件静态检查通过。本次 HTTP 使用模拟响应，未重新执行真实厂家调用或 Chrome Worker/RPC 验收；下方此前实测不代表这次脚本实现已完成浏览器验收。

## Choice 对象条件收敛后的最终复验

2026-10-28，仍为未发布的 OpenRouter 1.2.0 / SDK 3，不增加兼容分支或迁移。决策服务已从脚本改为 `services/decisions.json` 声明式规则，直接透传 state / questions 并映射 model / answers / usage；发布包不再包含 decisions.js。以下复验覆盖最终对象接口，后续初次记录仅用于保留开发过程中的实测证据。

- 插件公共 Choice 条件只接受非空对象，选项键不能全为空白。返回 choice 必须属于条件对象的自有键，不能返回描述、未知键或继承属性名。Score 继续使用有序数组，Noul 保持原结构；本地推理引擎的内部类型与数组处理未改。
- 真实生产 ZIP / 注册器 / 声明式执行器 / 传输层发送 `{en:"Text primarily written in English",zh:"Text primarily written in Chinese"}`，返回 en、Noul 0.99、Score 1.75；usage 为 input_tokens 375、output_tokens 61、cost 0.00001575。随后提交数组、空对象和空白键，注册器均在联网前拒绝；整个流程只有一次真实网络请求。
- 新 Chrome 生产构建成功，重新导入最终 ZIP 并创建 Jev 实例。默认 JSON 已是对象条件（选项标识和描述不同），真实请求返回 English。界面中数组、空对象、空白键均显示 `Invalid decision question.`。
- Chrome 中改用 en / zh 对象条件并混合 Score / Noul，真实请求返回 en、Noul 0.99、Score 1.78；声明式执行及结果展示成功。临时扩展在验收后移除。
- 插件默认测试 18 项包测试、16 项协议测试通过；全部插件宿主集成 63 项通过，包含非法输入不联网及未知返回键拒绝。
- 宿主 providers / 内置本地插件回归 48 个套件、491 项通过；本地 Jev 核心 7 项通过。最后的校验 / 协议 / 测试输入定向回归 101 项通过，修改的 JS/TS 通过 Prettier / ESLint。
- 干净临时目录完整构建通过，最终 OpenRouter ZIP 仍为 dist/openrouter/1.2.0.zip；未覆盖本机冲突的其他旧插件包，未提交、推送或发布。

## 真实 OpenRouter API：生产插件执行链

先通过 HTTP 核对厂家格式，再以生产 ZIP 加载器、实例配置、执行器、传输层和结果校验器调用真实接口。以下初次记录来自 Choice 对象接口收敛前的开发包；最终实现的复验见下方新增记录。输入为 `Hello. 你好，这是语音合成测试。`。

| 模型 | HTTP / 原始响应 | 宿主资产 | 资产大小 |
| --- | --- | --- | --- |
| google/gemini-3.8-flash-tts | 200 / audio/pcm; rate=24000; channels=1 | audio/wav | 192044 字节 |
| google/gemini-3.8-flash-lite-tts | 200 / audio/pcm; rate=24000; channels=1 | audio/wav | 197804 字节 |
| qwen/qwen-audio-3.0-tts-plus | 200 / audio/mpeg | audio/mpeg | 63451 字节 |
| qwen/qwen-audio-3.0-tts-flash | 200 / audio/mpeg | audio/mpeg | 77851 字节 |

Gemini Flash 省略 response_format 时实测返回 PCM；显式指定 mp3 时 HTTP 400，错误为只支持 pcm。`curl --output output.mp3` 只决定文件名，不能改变编码。

Jev 使用 `/api/alpha/decisions`，返回模型 `typesafe/jev-1.14-20261014`。开发阶段曾验证厂家拒绝 Choice 数组条件（400，expected record），并临时在脚本中转换数组后请求成功；该转换逻辑已移除，当前公共接口只接受对象，决策服务改为声明式实现。旧开发包的两种输入均返回 200。两次均判断 English、Noul 0.99、Score 1.86 / 1.85。保留 input_tokens 378、output_tokens 61 和 cost；没有补造 action 或 Noul confidence。

复测：设置环境变量 OPENROUTER_API_KEY，执行 `node plugins/openrouter/tests/live-tts-decisions.cjs <输出目录>`。报告仅含模型、响应元数据和标准结果；音频用于播放验收。该命令不纳入离线默认测试，不访问或保存凭据文件。

## 真实 Chrome 扩展验收

`npm run build:chrome` 成功，加载本地未打包扩展（宿主版本仍为 2.1.1），通过插件页面导入 OpenRouter 1.2.0 ZIP，并从服务配置界面创建三个 TTS 服务及 Jev 服务实例。

- Gemini Flash：真实请求生成 audio/wav，HTMLAudioElement readyState 4，时长 1.08 秒，play() 成功且正常 ended。
- Gemini 音色菜单显示全部 30 项，修改为 Puck、保存、重新加载页面后确认配置保留。
- 同一 Gemini 实例切换 Flash Lite 并保存，生成 audio/wav，时长 1.00 秒，play() 成功。
- Qwen Plus / Flash 分别生成 audio/mpeg，时长 0.864 / 1.176 秒，play() 成功。
- 初次开发包的 Jev 默认测试输入为 Choice 数组（当前已改为对象），经真实 Worker/RPC 与厂家调用得到 English；改为对象条件并添加 Score、Noul 后返回 English、Score 1.81、Noul 0.99。Noul 没有 confidence，所有答案没有 action，界面正常展示。

此验收确认真实浏览器配置、网络、Worker/RPC、资产传递和媒体解码 / 播放路径；不代表人工听评音色、朗读内容或长期稳定性。未执行 Edge 或真实供应商聊天 / ASR 复测。临时测试扩展在验收后移除。

## 自动回归与构建

- 插件默认测试：18 项包测试、16 项协议测试通过；八语言字段标签完整。
- 插件全部真实宿主集成：62 项通过，HTTP 使用模拟数据。
- 宿主 providers 与本地插件回归：48 个测试套件、486 项通过，包含 SDK 1/2/3、字幕时间单位及决策校验。
- 宿主设置界面：2 个测试套件、116 项通过。
- 修改的宿主 JS/TS 通过 ESLint / Prettier；Chrome 生产构建通过。
- 干净临时目录中的四插件完整构建通过，生成 OpenRouter 1.2.0。常规构建被本机既有 `openai-compatible-bundle/2.0.3.zip` 内容与源码不一致保护拦截；未删除、覆盖该旧产物或改变其插件版本。

---

# OpenRouter 1.1.2 实测记录

日期：2026-10-27。使用用户授权的测试 key，密钥仅在内存中传递，未保存到源码、报告或发布包。

## 聊天与翻译

通过生产包解析器、实例注册器、声明式执行器、SDK 和 HTTP 传输层调用 `openai/gpt-6-luna`。聊天与翻译代码在 1.1.2 中未修改。

| 检查         | 结果                              | 耗时    |
| ------------ | --------------------------------- | ------- |
| 聊天         | 通过，得到指定回复                | 3.27 秒 |
| 流式聊天     | 通过，4 个事件并正常结束          | 1.33 秒 |
| 单句翻译     | 通过，中文结果                    | 1.51 秒 |
| 批量翻译     | 通过，两个稳定 ID 和中文结果      | 2.61 秒 |
| 流式批量翻译 | 通过，2 个事件、稳定 ID、正常结束 | 2.52 秒 |

## ASR 时间戳

依据 [OpenRouter 转写文档](https://openrouter.ai/docs/guides/overview/multimodal/stt)，通过 JSON Base64 调用 `/api/v1/audio/transcriptions`，发送 `response_format: "verbose_json"` 与 `timestamp_granularities: ["segment", "word"]`。

先对两个模型进行普通 JSON 与详细 JSON 对照，再通过最终插件的 Sval 执行器、生产 SDK、实例注册器、资产存储及 HTTP 传输层验证 WAV/PCM16、M4A/AAC-LC 和实际 YouTube M4A。两种模型均成功。

| 模型                          | 约 7.2 秒生成语音（M4A）    | 约 9.78 秒实际视频语音（M4A） |
| ----------------------------- | --------------------------- | ----------------------------- |
| openai/whisper-large-v3-turbo | 3 个分段、13 个原始词时间戳 | 2 个分段、30 个可用词时间戳   |
| qwen/qwen3-asr-0.6b           | 1 个分段、13 个可用词时间戳 | 1 个分段、30 个可用词时间戳   |

普通 JSON 请求两者均只有文本。1.1.1 插件固定请求普通 JSON，且返回时只保留 text，无法使用时间戳。1.1.2 改为请求详细格式并返回完整的 SDK 标准结果，Manifest 声明支持时间戳。

Whisper 在生成语音样本中的部分词超出厂家分段边界，例如第一段结束于 0.62 秒，而词 Hello. 结束于 0.68 秒。宿主按文本完整性与区间约束保守保留分段，不接受不完整的词对齐。初次“每个样本都必须保留词时间”的验证因此失败；确认是厂家边界差异后，按分段必须有效、词时间仅在对齐完整时使用的标准复测通过。没有扩大分段或伪造词边界。

Qwen 的 test.、A. 等词偶尔返回相等的 start/end。宿主原来过滤这些词，可能丢失文字；配套修复保留实际范围内的零时长词，仍移除被音频裁切排除的词。新增通用回归覆盖句中及句尾零时长词、原文完整性和按真实时间断句。

## 宿主字幕处理回放

将本轮实际 API 返回数据通过生产 SDK 解析、音频时间归一化和内置规则断句回放，检查文字完整性及有效的字幕区间；这一步不重新调用模型。

实际样本 `youtube-e3iQy15SWFk-18960-28720.m4a`：

- Whisper：2 个厂家分段经词时间断句为 3 条字幕，约 0–3.24、3.40–6.72、6.92–9.58 秒。
- Qwen：1 个厂家分段经词时间断句为 2 条字幕，约 0–6.56、7.04–9.52 秒。
- 生成语音：Whisper 为 3 条、Qwen 为 2 条字幕。四个回放均完整保留原文，不通过字数分配时间。

## 验证边界

以上证明本账户、本次路由和这些短音频的真实 API 及生产 SDK 行为。未验证任意语言、长音频、所有编码、自定义模型或其他上游路由；不保证每个句号都有厂家分段。未经过扩展 Worker/RPC、插件升级界面或 YouTube 实际播放验收。

已有服务实例保留旧配置和执行快照；导入 1.1.2 后需要升级实例或重新添加服务。宿主也需包含零时长词保留修复。更换插件代码会改变识别缓存签名，旧结果不能证明新参数是否生效。
