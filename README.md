# KISS Translator 官方插件

[English](README.en.md) | [简体中文](README.md)

由[简约翻译](https://github.com/fishjar/kiss-translator)项目维护的服务适配插件。插件通过网络安装，使用服务时通常还需要 API Key 和网络连接。

## 插件

| 插件                                                          | 支持能力                                                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [DeepSeek](plugins/deepseek/README.md)                        | 对话、翻译、AI 词典、字幕断句、流式输出与思考模式。                                          |
| [OpenAI 兼容协议](plugins/openai-compatible-bundle/README.md) | 对话、翻译、AI 词典、字幕断句、语音识别、语音合成和图片全文识别。                            |
| [OpenRouter](plugins/openrouter/README.md)                    | 对话、翻译、AI 词典、字幕断句，以及 Whisper/Qwen 语音识别、Gemini/Qwen 语音合成和 Jev 决策。 |
| [SiliconFlow](plugins/siliconflow/README.md)                  | 对话、翻译、AI 词典、字幕断句、Qwen 和星辰语音识别、PaddleOCR 和 DeepSeek OCR 全文识别。     |

这些适配插件由简约翻译维护，不代表对应服务商发布或背书。

## 开发与发布

需要 Node.js 22。执行 `npm ci`、`npm test`、`npm run build`。产物在 `dist/`，每个 ZIP 的根部包含 Manifest，只收录实现和资源，不包含账号配置或开发文件。

每个插件独立递增 Manifest 版本，禁止覆盖已发布版本。合并到 main 后，Actions 校验并将目录和版本化 ZIP 原子发布到 dist 分支。旧版本安装包保留，插件目录只指向各插件最新版本。目录入口：

https://raw.githubusercontent.com/fishjar/kiss-translator-plugins/dist/catalog.json

可在简约翻译的“接口插件”页面安装，也可下载 ZIP 后导入。官方仓库包含多个插件，不能使用仓库根地址作为单插件安装地址。

当前全部官方插件使用数字 `apiVersion: 1`，需要新版插件 API 1 宿主。开发阶段不兼容旧契约；请重新导入包并创建实例。

新增官方插件的目录结构、协议测试与 CI 发布步骤，以及协议和 SDK 契约，见[插件开发指南](docs/plugin-development-guide.md)。[签名词典](examples/signed-dictionary/README.md)仅为开发教学示例，不作为官方服务分发。

外部插件作者可为公开仓库添加 `kiss-translator-plugin` Topic，供宿主自动发现；一个仓库对应一个插件，默认分支根目录必须包含 manifest.json。Topic 不代表官方审核。

本项目采用 [MIT License](LICENSE)。部分源码迁自 fishjar/kiss-translator，保留原项目及贡献者署名；宿主仓库的许可证独立维护。发布 ZIP 包含许可证全文。

四个官方插件通过 Manifest 的 `icon` 引用包内 `assets/logo.png`，安装后从本机读取，离线也可显示。服务实例与本机模板版本不一致、缺少模板或图标解码失败时回退默认图标；已有实例需通过宿主现有升级流程匹配新模板。图标不随实例同步到其他设备。DeepSeek、OpenRouter 和 SiliconFlow 品牌图形归各自所有者，代码的 MIT 许可证不重新授权品牌资产；来源与原始素材见各插件的 `assets/SOURCES.md`。OpenAI 兼容协议采用中性的接口连接图标。

构建和发布仅清理停用的 `example-deepseek`、`example-openai-compatible-bundle` 分发目录，保留现役插件的历史 ZIP 和其他文件。清理生效后，两个旧示例的直接下载链接不可用；已有实例快照不会被删除，但不能再通过旧链接恢复模板。远端清理随正常发布提交生效，不重写分支历史。

## 本地校验与发布门槛

仅需本仓库和 Node.js 22：`npm ci`、`npm run check`、`npm test`、`npm run build`。`check -- <目录或 ZIP>` 检查单包，不带参数检查所有官方插件。默认测试覆盖打包与供应商适配逻辑，SDK 使用测试替身，不读取或下载宿主源码。

`npm run test:host` 是可选的真实宿主 SDK 集成测试，需额外准备宿主源码和依赖，可用 `KISS_TRANSLATOR_ROOT` 指定位置。它不是默认 CI、打包或发布的前置条件，也不绑定宿主分支或提交 SHA。默认测试还检查官方插件设置标签的八语言完整性，这项元数据要求不限制第三方插件加载。

需要在 Actions 验证时，手动运行 [Optional host compatibility](.github/workflows/compatibility.yml)，必填 `host_ref`，选择 `fishjar/kiss-translator` 的分支、标签或提交。工作流记录双方实际提交 SHA，使用真实宿主 SDK、解析器和执行器配合模拟 HTTP 响应；不需要供应商密钥，不执行发布。它不自动触发、不作为合并必需检查，也不阻塞发布工作流；主仓库无需对应修改。尚未实际运行的工作流不能视为已通过线上验收。

模型参数分支是插件的适配策略；独立测试证明请求构造逻辑，宿主集成证明指定源码版本下的执行行为，两者都不能证明所有真实模型接受这些参数。真实服务与浏览器验收需要有效凭据和实际调用，单独记录验证版本及结果。

`apiVersion: 1` 是唯一插件契约版本，覆盖清单、规则和 SDK 能力；不再使用 manifestVersion / rulesVersion。插件 version 和宿主发布版本仍独立。发布器独立校验，不依赖宿主源码。

当前验证结果及浏览器验收边界见[插件 API 1 验收记录](docs/plugin-api-1-acceptance.md)。
