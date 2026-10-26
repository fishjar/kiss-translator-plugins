# KISS Translator 官方插件

由简约翻译项目维护的服务适配插件。插件通过网络安装，使用服务时通常还需要 API Key 和网络连接。

## 插件

- [DeepSeek](plugins/deepseek/README.md)：聊天、翻译、流式输出与思考模式。
- [OpenAI 兼容协议](plugins/openai-compatible-bundle/README.md)：聊天、翻译、转写、语音合成和图片全文识别。
- [OpenRouter](plugins/openrouter/README.md)：保留现有实现，详见插件文档。
- [SiliconFlow](plugins/siliconflow/README.md)：DeepSeek 聊天与翻译、Qwen 和星辰音频转写、PaddleOCR 和 DeepSeek OCR 全文识别。

这些适配插件由简约翻译维护，不代表对应服务商发布或背书。

## 开发与发布

需要 Node.js 22。执行 `npm ci`、`npm test`、`npm run build`。产物在 `dist/`，每个 ZIP 的根部包含 Manifest，只收录实现和资源，不包含账号配置或开发文件。

每个插件独立递增 Manifest 版本，禁止覆盖已发布版本。合并到 main 后，Actions 校验并将目录和版本化 ZIP 原子发布到 dist 分支。旧版本安装包保留，插件目录只指向各插件最新版本。目录入口：

https://raw.githubusercontent.com/fishjar/kiss-translator-plugins/dist/catalog.json

可在简约翻译的“接口插件”页面安装，也可下载 ZIP 后导入。官方仓库包含多个插件，不能使用仓库根地址作为单插件安装地址。

需要 SDK v1 宿主。安装与更新仅修改模板，不改变既有服务实例；请通过宿主的实例升级流程更新已有实例。

新增官方插件的目录结构、协议测试与 CI 发布步骤，以及协议和 SDK 契约，见[插件开发指南](docs/plugin-development-guide.md)。[签名词典](examples/signed-dictionary/README.md)仅为开发教学示例，不作为官方服务分发。

外部插件作者可为公开仓库添加 `kiss-translator-plugin` Topic，供宿主自动发现；一个仓库对应一个插件，默认分支根目录必须包含 manifest.json。Topic 不代表官方审核。

本项目部分源码迁自 fishjar/kiss-translator，遵循 GPL-3.0，保留原项目及贡献者署名。

## 本地校验与发布门槛

仅需本仓库和 Node.js 22：`npm ci`、`npm run check`、`npm test`、`npm run build`。`check -- <目录或 ZIP>` 检查单包，不带参数检查所有官方插件。默认测试覆盖打包与供应商适配逻辑，SDK 使用测试替身，不读取或下载宿主源码。

`npm run test:host` 是可选的真实宿主 SDK 集成测试，需额外准备宿主源码和依赖，可用 `KISS_TRANSLATOR_ROOT` 指定位置。它不是打包、CI 或发布的前置条件，也不绑定宿主分支或提交 SHA。

插件在 Manifest 和目录中声明 `apiVersion`、可选 `minHostVersion`。宿主加载列表时判断兼容性，并在安装和执行边界复核；发布器只校验版本格式，不根据某台机器上的宿主版本限制发布。静态检查、适配单元测试、宿主集成、真实厂家调用与浏览器验收分别记录。
