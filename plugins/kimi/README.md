# Kimi 插件

[English](README.en.md) | [简体中文](README.md)

1.0.0：从简约翻译内置的 Kimi 接口（fishjar/kiss-translator PR #1295）迁移为插件，使用插件 API 1（数字 `apiVersion: 1`）。

插件提供两个服务，能力相同，区别是接口地址、API Key 类型和模型目录：

| 服务                     | 适用的 Key           | 默认基础地址                     | 模型目录                                 |
| ------------------------ | -------------------- | -------------------------------- | ---------------------------------------- |
| 对话与翻译（Kimi Code）  | Kimi Code 会员 Key   | `https://api.kimi.com/coding/v1` | `kimi-for-coding`（默认）、`k3`、`k3.1-pro` |
| 对话与翻译（开放平台）   | Kimi 开放平台 Key    | `https://api.moonshot.cn/v1`     | `kimi-k2.6`（默认）、`kimi-k3`、`kimi-k3.1-pro` |

两个服务都提供 `chat`、`translate`、`dictionary`、`segmentSubtitle`，支持完整结果、流式输出和按稳定 ID 对齐的批量翻译；字幕断句只用完整响应。实现见 [services/chat.js](services/chat.js)，两个服务共用这一个脚本。

## 安装与配置

1. 在“接口插件”安装官方插件，或在“接口插件 → 导入文件夹”选择本目录（根部直接包含 `manifest.json`）。
2. 在“服务配置 → 添加 → 插件接口”按自己的 Key 选择 Kimi Code 或开放平台服务。
3. 填写 API Key，选择模型并保存，再用能力测试或翻译场景验证。

| 配置         | 默认值与说明                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------- |
| API 基础地址 | 见上表；SDK 追加 `/chat/completions`，不要填写完整端点                                         |
| API Key      | 必填；由宿主以 Bearer 注入，包内不含密钥                                                       |
| 模型         | 见上表；可手填其他模型 ID                                                                      |
| 思考模式     | 关闭；可选接口默认 / 开启思考 / 关闭思考，接口默认不发送思考参数                                 |
| 思考强度     | 接口默认；可选 `low` / `high` / `max`，仅开启思考时发送，只对支持强度的模型生效                 |

## 按模型发送的参数

Kimi 各模型接受的思考参数不同，传了模型不接受的值会返回 400，所以脚本按模型 ID 选择参数：

| 模型                                                  | 关闭思考                                         | 开启思考                                        |
| ----------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| `kimi-for-coding`、`k3`、`k3-256k`                    | `thinking: {type: "disabled"}`                   | `thinking: {type: "enabled"}`，可带强度          |
| `k3.1-pro`、`k3.1-pro-highspeed`                      | 拒绝 disabled，改发 `enabled` + `reasoning_effort: "low"` | `thinking: {type: "enabled"}`，可带强度 |
| `kimi-k2.6`、`kimi-for-coding-highspeed`              | `thinking: {type: "disabled"}`                   | `thinking: {type: "enabled"}`，无强度参数        |
| `kimi-k3`、`kimi-k3.1-pro`、`kimi-k3.1-pro-highspeed` | 始终思考，发 `reasoning_effort: "low"`            | 只发 `reasoning_effort`，接口默认时不发          |
| `kimi-k2.7-code`、`kimi-k2.7-code-highspeed`          | 不发思考参数                                     | 不发思考参数                                    |
| 其他模型                                              | 不发思考参数                                     | 不发思考参数                                    |

K 系列（`kimi-` 或 `k3` 开头）固定采样参数，传 `temperature` / `top_p` 会返回 400，插件不发送这两个参数；同时发送 `max_completion_tokens: 16384`，避免思考内容占满默认输出上限。其他模型使用接口默认的采样参数和输出上限。

完整聊天结果保留 `reasoning_content` 为 `reasoning`，流式聊天输出 `reasoning.delta` 和 `text.delta`；翻译只解析正文，思考内容不会混入译文。

## 提示词

默认提示词与 DeepSeek 等官方 LLM 插件一致：单段翻译、聚合翻译（JSON）、标准词典和字幕断句。可在插件页预览，也可在提示词管理中改用 LINE / XML 等聚合格式。

## 验证

在仓库根目录执行 `npm ci`、`npm run check`、`npm test`、`npm run build`。`tests/kimi.test.cjs` 用 SDK 测试替身覆盖各模型的请求参数、流式翻译和字幕断句；`tests/kimi.host.test.cjs` 需要宿主源码，由 `npm run test:host` 执行。模拟响应不能代替真实服务和浏览器验收。

## 参考

- [Kimi Code 文档](https://www.kimi.com/code/docs/)
- [Kimi 开放平台模型列表](https://platform.kimi.com/docs/api/models-overview)
