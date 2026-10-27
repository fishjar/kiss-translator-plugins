# SDK 2 验证记录

验证日期：2026-10-27。以下为本地工作区结果，尚未提交或发布。

## 版本与兼容

- 宿主发布版本保持 `2.1.1`；当前代码支持 `apiVersion: "1"` 和 `"2"`，SDK 版本独立于发布版本。
- 官方插件：DeepSeek `1.2.5`、OpenAI Compatible `2.0.3`、OpenRouter `1.1.3`、SiliconFlow `1.1.4`，均声明 SDK 2，不设置 `minHostVersion`。
- 回归验证 SDK 1 包和实例仍能加载，未知 SDK 被拒绝，旧包不补写默认版本字段。外部 `speak` 声明被拒绝；内置系统朗读继续保留。

## 自动测试与构建

- 宿主 providers、相关翻译/词典/字幕/视觉场景及 builtin-plugins：61 个套件、645 项测试通过。
- 插件包测试 18 项、协议测试 15 项、宿主集成测试 55 项通过，共 88 项。包含真实 Sval 解释器与生产 SDK，厂家 HTTP 为模拟响应。
- 补充服务配置界面 Apis 92 项测试通过，插件管理与兼容字段专项 39 项测试通过。Apis 首轮与构建并发时出现超时，隔离重跑整个套件后 92/92 通过；未据此扩大修改界面代码。
- 开发指南的 SDK 2 JSON 示例经真实规则校验器验证；脚本示例经真实解释器及 SDK 执行。四个官方插件通用默认提示词与 SDK 对应默认值一致。
- 修改相关的 ESLint、`git diff --check`、Chrome 生产构建、插件静态检查及连续两次插件生产构建通过。历史发布 ZIP 未覆盖。

宿主验证命令：

```powershell
$env:CI='true'
pnpm test --watch=false --runInBand src/providers src/apis/trans.dict.test.js src/apis/trans.subtitle.test.js src/apis/index.test.js src/apis/vision.test.js src/builtin-plugins
pnpm build:chrome
```

插件验证命令：

```powershell
npm test
npm run test:host
npm run check
npm run build
npm run build
```

## 真实浏览器与边界

使用独立、隐藏运行的 Edge `156.0.4314.42` 配置加载生产扩展，不修改已有浏览器配置。

- 在接口插件页面通过 ZIP 文件选择器和安装确认界面安装 OpenAI Compatible `2.0.3`；在服务页面通过添加菜单创建实例，同步模板索引与保存的快照 SDK 均为 2，包含 chat、translate、dictionary、segmentSubtitle 四项能力。
- 通过真实扩展 Port → background → Offscreen → 声明式执行器或脚本 Worker/Sval → HTTP Broker 完成调用。
- 13 种网络能力分别使用声明式和脚本式执行，26/26 成功：chat、translate、summarize、dictionary、detectLanguage、suggest、segmentSubtitle、evaluate、recognizeText、parseImage、analyzeLayout、transcribe、synthesizeSpeech。
- chat/translate/summarize/dictionary 各自两种实现共 8 次流式调用收到增量事件；JSON 翻译可返回 item.complete。26 个请求均通过 Broker 注入模拟鉴权；两种 TTS 均经 RPC 返回音频资产字节；ASR 收到上传文件名。
- 宿主仓库本地 `tmp/sdk2-browser-acceptance.cjs` 为该次验收脚本，`tmp/sdk2-browser-results.json` 保存结果。这些临时文件不作为插件包或 CI 前置依赖。

服务端为本机 HTTP 模拟服务，图片和音频仅用测试字节验证资产传输。以上结果证明真实浏览器的安装、实例创建、Worker/RPC、协议构造、流式与资产通路，不证明真实厂家的模型接受全部参数、坐标或时间戳准确，也不证明提示词的实际输出质量。本次未调用真实厂家服务。
