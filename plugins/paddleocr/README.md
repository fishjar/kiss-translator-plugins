# PaddleOCR 官方 API

[English](README.en.md) | [简体中文](README.md)

由简约翻译项目维护，通过百度 AI Studio 的 PaddleOCR 官方异步 API 提供两项服务。使用插件 API 1，支持简约翻译 2.2.5 及更新版。

| 服务 | 已验证的模型 | 输出 |
| --- | --- | --- |
| 文字识别 | PP-OCRv6（默认）、PP-OCRv5、PP-OCRv5-latin | 文字与每行的坐标 |
| 文档解析 | PaddleOCR-VL-1.6（默认）、PaddleOCR-VL-1.5、PP-StructureV3 | 整图文字及版面块，包含服务识别到的表格和公式 |

## 使用

1. 在扩展的「接口插件」中安装 PaddleOCR。可从官方目录安装，也可导入 ZIP。
2. 在「服务配置」中新建需要的服务实例，填写 [AI Studio Access Token](https://aistudio.baidu.com/account/accessToken)，并选择模型。模型限于上表验证过的选项。
3. 在图片翻译中选择该实例作为识别服务。在支持整图优先的宿主中，选择自带版面的文档解析服务时会跳过自动前置版面分析。2.2.5 沿用已配置的独立版面服务和裁图流程。PDF 翻译由宿主先划分区域，再按识别设置提交区域图片。

文档解析优先按页读取版面块，保留块类型和阅读顺序。缺少坐标的块仍参与翻译。服务未提供可用文字块时，该页使用 Markdown 文本。文档解析只提供整图模式。

整图文档解析由所选模型和任务参数驱动，无需填写提示词。插件提取原文和版面，译文由所选翻译服务生成。

「接口地址」默认为 `https://paddleocr.aistudio-app.com`。可填写兼容网关的基础地址，插件会追加 `/api/v2/ocr/jobs`，并将图片和 Access Token 发送到该地址。任务最多等待 100 秒，并受宿主调用超时限制。

在 2.2.5 中，使用官方接口前请在「基本设置 → 禁用Origin名单」中单独添加一行 `https://paddleocr.aistudio-app.com`。支持插件 Origin 声明的新宿主会自动管理该规则。

识别结果通过预签名 HTTPS 链接下载。常用的百度对象存储域名已内置，若返回的下载域名未获授权，再填写「额外结果下载域名」，例如 `https://files.example.com`。下载请求不携带 Access Token。

[官方 API 文档](https://www.paddleocr.ai/latest/en/version3.x/inference_deployment/serving/paddleocr_official_api/typescript.html) · [验收记录](ACCEPTANCE.md) · [原始贡献 Gouzau-cn](https://github.com/fishjar/kiss-translator-plugins/pull/7)
