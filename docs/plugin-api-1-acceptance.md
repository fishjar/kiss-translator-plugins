# 数字版插件 API 1 验收记录

日期：2026-10-28。基于本次未提交源码；源码主分支未推送，宿主未发布，扩展及插件版本未调整。插件开发分发 dist 已按下方一次性重建记录更新。

## 契约

- 宿主、四个官方插件、内置服务及签名词典示例统一使用数字 `apiVersion: 1`。
- Manifest 不含 `manifestVersion`；声明式文件使用 `format: "http"` / `"protocol"`，不含 `rulesVersion`。
- 字符串版本、缺失版本及旧字段明确拒绝，不转换或迁移旧实例。目录允许展示正整数但不受支持的 API 版本，安装在下载前拒绝。
- 请求引用支持 `fallbackRef`，仅在主值为 undefined/null 时回退；省略和转换随后执行。非法路径、秘密配置引用、响应或条件中的回退在联网前拒绝。
- OpenRouter / OpenAI Compatible TTS 使用声明式音色回退。保留 PCM 转 WAV、L16 拒绝、字幕秒单位及无坐标 OCR 的 Markdown 行为。

## 自动验证

- 插件包测试 22 项、独立协议测试 16 项、全部插件宿主集成 67 项通过。HTTP 使用模拟响应。
- 四插件及签名词典示例独立静态检查通过；最终 ZIP 均经宿主生产包加载器解析。
- 宿主 providers、内置服务、设置、文件翻译、图片翻译、弹窗及相关场景回归通过。首次扩大回归出现 UI 超时和模型菜单测试不稳定；目录测试补齐必填版本后复验通过，Apis 以 15 秒单项超时完整复跑通过，模型选择测试单独复跑通过。
- 生产代码及新增测试通过 ESLint / Prettier；修改的既有测试对照 HEAD 有 126 条原有 ESLint 诊断，无新增诊断。未顺带修复无关测试风格问题。
- Chrome 优化生产构建和独立本地运行时构建成功；完成 offscreen 及文件桥接构建后处理。未覆盖原 build/chrome。

## 契约收敛阶段临时产物（重建前）

- Chrome：`D:/code/kiss-translator/tmp/plugin-api-1/chrome`。
- 插件包及数字版目录：`D:/code/kiss-translator/tmp/plugin-api-1/packages/dist`。
- 签名词典示例：`D:/code/kiss-translator/tmp/plugin-api-1/packages/signed-dictionary.zip`。
- 未覆盖插件项目原 dist 中的同版本产物；构建测试继续验证哈希确定性及禁止同版本覆盖。

## 验证边界

本次未完成真实 Chrome 扩展安装、配置保存、媒体播放和 Worker/RPC 验收。Chrome DevTools 工具因既有调试配置被占用而无法连接；终端启动独立测试浏览器被自动审批拒绝，未提供具体原因；替代浏览器工具无法控制 Chrome 扩展管理页。未关闭现有浏览器、修改现有插件或清理用户数据。

进程环境未提供 OPENROUTER_API_KEY，本次未读取其他凭据或调用真实厂家。此前旧 SDK 的 API / Chrome 验收仅为历史，不能代替本次数字版契约验收。

## URL、音频与分发修复复验

- 宿主与独立发布器拒绝编码后的 `..` 路径段、反斜杠、控制字符和非法百分号编码；宿主构造最终 URL 后检查 origin 与规范化基础目录前缀，非法规则在 HTTP 前拒绝。基础地址的 query/fragment 不传入相对路径解析。
- responseAudio 路径中的已有 WAV 校验 RIFF 总长度、含偶数字节填充的 chunk 边界、fmt 和非空 data；合法附加 chunk 原样保留。这是有限容器校验，不保证音频解码或播放。
- PCM 的 44 字节 WAV 头在输出 Blob 分配前计入资产预算；HTTP 字节缓冲区仍会占用内存，8 MiB 预算不是进程峰值内存上限。新增 transport broker 模拟 HTTP 回归覆盖转换、原样透传、非法请求、精确容量边界、已有资产总量和文件数量限制。
- 宿主 providers / 内置服务 60 个套件、670 项通过；上层设置、文件、图片和字幕 10 个套件、276 项通过。最终定向复跑同时覆盖字段回退与传输新用例，12 个套件、343 项通过（与前述统计有重叠）。新增及修改的修复代码通过 ESLint / Prettier，git diff --check 通过。
- 插件最终包测试 23 项、独立协议测试 16 项、宿主集成 67 项通过；四插件独立静态检查通过。所有 HTTP 场景使用模拟响应，未新增真实供应商或浏览器验收。

## 开发分发一次性重建

- 按开发阶段决策，不提高当前四个插件版本。清理前 dist SHA：`53d00c5fd29ee1b83f02beea3f80f883564fd1f6`，重建提交：`b5ee7541d47927ad19b8c23b17308024d4369c56`。使用普通提交推送，仅更新 dist，保留 Git 历史。
- 本地和远程四个插件旧 ZIP 已清理；当前仅保留 DeepSeek 1.2.5、OpenAI Compatible 2.0.3、OpenRouter 1.2.0、SiliconFlow 1.1.4 和匹配的 catalog.json。其他无关文件不在清理范围内。
- 干净目录连续构建、ZIP 静态检查、宿主生产加载器检查及 SHA-256 核对通过。清理后的普通 npm run build 连续两次成功；原有测试仍验证同版本变更拒绝及历史包保留，未修改构建保护或长期发布策略。
- 推送后重新获取远程分支，并通过 raw 下载目录和四个 ZIP，全部内容与验证产物一致。旧 ZIP 从当前分支文件树删除，不表示从 Git 历史或所有 CDN 缓存中抹除。

## 提交完整性

- 宿主新增 `audioAsset.js`、`audioAsset.test.js`、`audioTransport.test.js` 和 `fallback.test.js` 均需纳入源码提交。
- 插件新增本验收文档、`api1-docs.host.test.cjs`、OpenRouter 的 `decisions.json` / `speech-mp3.json` / `speech-pcm.json`、对应决策和语音测试、在线联调脚本、`scripts/declarative-rules.cjs` 和 `tests/api-contract.test.cjs` 均需纳入源码提交。
- 原 `docs/sdk-2-acceptance.md` 与 `sdk2-docs.host.test.cjs` 的删除分别由 API 1 验收记录与 `api1-docs.host.test.cjs` 替代，提交时需保留成对变更。
- 临时构建、清理前 SHA / 文件清单、远程哈希核验记录放在宿主忽略的 tmp 目录，不进入源码或发布包。源码尚未提交或推送；仅 dist 分发提交已推送。
