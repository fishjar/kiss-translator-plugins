> 历史验收：本文记录旧开发契约。当前已统一为数字版插件 API 1，以下结果不代表新契约的验收结果；当前结果另行记录。

# SiliconFlow 实测记录

## OCR 坐标与段落补测（2026-10-27）

本节区分模型能力与当前插件输出。测试使用本地生成的 1400×850 清晰图片：标题、两个栏标题、四个多行英文段落、一个两行中文段落；绘制位置和文字作为对照。

| 模型及提示 | 真实接口结果 | 段落处理 |
| --- | --- | --- |
| PaddleOCR-VL-1.5，`OCR:` | HTTP 200，约 101.45 秒，全文文本，无坐标 | 同段换行已合并，独立段落保留，左右栏未交错 |
| PaddleOCR-VL-1.5，`Spotting:` | HTTP 200，约 101.58 秒，15 个行级四边形，以 `<\|LOC_n\|>` 输出 | 输出仍按行，中文页尾出现在右栏之前，不能将输出顺序直接当作可靠阅读顺序 |
| DeepSeek-OCR，`Free OCR.` | HTTP 200，约 1.26 秒，Markdown 风格全文，无坐标 | 同段换行已合并，标题、独立段落和双栏阅读顺序保留 |
| DeepSeek-OCR，`<\|grounding\|>Convert the document to markdown.` | HTTP 200，约 2.10 秒，8 个标题/段落区域，带 ref/det 坐标 | 段落文字与区域一一对应，多行段落合为一块 |

坐标经归一化缩放后与已知绘制位置核对。Paddle 的 15 个行框最小 IoU 约 0.71；DeepSeek 的 8 个区域框最小 IoU 约 0.78。对照框由字体绘制测量产生，包含字体留白，数值只作此次样本的粗略定位核验，不代表通用精度。Paddle 将标题 OCR 的字母 O 识别为数字 0，不能据此宣称完美识别。

当前插件默认使用 `OCR:` / `Free OCR.`，没有解析上述坐标标记，两个实现仍输出 `items[].poly = null`。通过生产 SDK/Sval/HTTP 再次调用 DeepSeek 默认和 grounding 两种提示，均验证了这一点：grounding 标记原样留在 text 中，不会自动成为宿主可用的 polygon。仅改提示词不能完成区域回填适配。

结论：两种模型经 SiliconFlow API 均有坐标输出能力，不应将模型描述成“只能识别文字”；当前官方插件仍仅接入全文识别。两者在本样本都能合并段内换行；Paddle 行坐标模式还需段落分组及阅读顺序处理，DeepSeek grounding 在该样本直接给出段落区域。未验证任意复杂页面、扭曲/旋转文本或浏览器原位回填，本次不修改坐标能力声明。

官方模式依据：[PaddleOCR-VL-1.5 模型卡](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.5)、[DeepSeek-OCR 提示示例](https://github.com/deepseek-ai/DeepSeek-OCR#prompts-examples)。

## 1.1.2 时间戳补测（2026-10-27）

本节更新下文旧版“ASR 不声明时间戳”的结论。使用约 7.2 秒英文语音测试官方 API，再通过最终 1.1.2 插件包、宿主生产 SDK、Sval 执行器、资产存储和 HTTP 传输层复测。

| 接口                                              | WAV/PCM16           | M4A/AAC-LC          | 时间戳结论                                      |
| ------------------------------------------------- | ------------------- | ------------------- | ----------------------------------------------- |
| transcriptions（Qwen3-ASR-1.7B）                  | 通过，1.05 秒       | 通过，0.31 秒       | 仅文本；时间戳参数探测返回 HTTP 400，不声明支持 |
| xingchen-transcriptions（XingChenASR-V3.2-Ultra） | 通过，1.43 秒，3 段 | 通过，1.43 秒，2 段 | 支持分段 start/end，未获得词级时间戳            |

星辰只需额外发送 `response_format=verbose_json` 即返回分段时间戳，Qwen 保持只发送 file/model。审查时发现早期增量探测脚本的内部模式名被误传为 response_format，导致“必须重复传入两种粒度”的结论错误；独立脚本以生成语音和实际视频分别对照省略格式/详细格式，确认最简参数有效。最终插件已删除多余的粒度字段，不依赖主项目 multipart 数组扩展。

M4A 样本的两个分句为 0–4.48 秒、4.64–7.00 秒；WAV 样本为 0–1.24 秒、1.28–4.44 秒、4.56–7.00 秒。两种容器的分句数量不同，均保留厂家返回边界，不按字数估算时间。测试不证明其他录音、语言或模型质量。

转写接口文档仅描述 text，没有完整说明以上时间戳行为，本结论来自真实请求。密钥未写入源码、报告或发布包。本次未经过浏览器 Worker/RPC、插件升级 UI 或实际 YouTube 播放验收。

## 1.0.0 基线记录（2026-10-26）

使用真实 SiliconFlow API 和用户授权的测试密钥完成以下请求；密钥未写入源码或报告。

| 检查                       | 结果 | 耗时（秒） |
| -------------------------- | ---- | ---------- |
| chat                       | 通过 | 0.97       |
| chat stream                | 通过 | 0.90       |
| single translation         | 通过 | 2.33       |
| batch translation          | 通过 | 2.15       |
| batch translation stream   | 通过 | 2.21       |
| Qwen transcription         | 通过 | 0.42       |
| XingChen transcription     | 通过 | 1.56       |
| paddleocr full-text OCR    | 通过 | 102.60     |
| deepseek-ocr full-text OCR | 通过 | 0.36       |

## 验证方式

使用宿主生产包解析器、实例注册器、声明式执行器、SDK、任务资产存储和 HTTP 传输层发起真实请求。脚本接口使用宿主所用的 Sval 解释器运行；Node 测试适配任务资产读取。没有经过浏览器 Worker/RPC 或扩展页面 UI，因此本记录不代表浏览器 UI 验收。

聊天验证回复文本，流式测试同时校验实际增量事件与正常终止；单句和批量翻译验证中文结果及稳定 ID。ASR 上传本地生成的约 7.2 秒、16 kHz 单声道 WAV，检查实际转写结果。OCR 上传本地生成的 1000×260 PNG，核对两行 `Hello SiliconFlow`、`Invoice total: 123.45`；忽略空白和大小写后整段文字必须一致，不接受额外虚构内容。

## 实测修正与边界

- PaddleOCR 的通用长提示词曾产生与图片无关的输出，改用官方任务指令 `OCR:` 和 temperature=0 后通过。该模型本轮约 103 秒，早先测试也曾接近 110 秒；服务设置中的请求超时和供应商排队可能影响实际体验。
- DeepSeek-OCR 的文本优先消息顺序会返回特殊标记或重复文字，改用图片在前、`Free OCR.` 指令在后的脚本适配后通过。没有用字符串清洗掩盖识别问题。
- 星辰 WAV 使用无扩展名文件名会返回 HTTP 400，Qwen M4A 则返回 HTTP 500；分别补全 `.wav`、`.m4a` 后通过。两个 ASR 共用脚本补全文件名，并在修复后重新验证 WAV 与 M4A。
- OCR 不声明坐标，ASR 不声明时间戳；没有测试原位回填或同步字幕能力。简单生成样本的成功不保证任意文档、录音、语言或自定义模型的识别质量。

## ASR 音频格式补测

使用最终共用 ASR 脚本重新验证真实 WAV（PCM16）和 M4A（AAC-LC）。M4A 由同一段 WAV 转换，16 kHz、单声道，约 7.2 秒；只对这些编码样本作出支持结论。

| 接口                    | 容器／编码 | MIME        | 结果 | 耗时（秒） |
| ----------------------- | ---------- | ----------- | ---- | ---------- |
| qwen-transcriptions     | WAV/PCM16  | audio/wav   | 通过 | 0.72       |
| qwen-transcriptions     | M4A/AAC-LC | audio/mp4   | 通过 | 0.28       |
| qwen-transcriptions     | M4A/AAC-LC | audio/x-m4a | 通过 | 0.27       |
| xingchen-transcriptions | WAV/PCM16  | audio/wav   | 通过 | 2.31       |
| xingchen-transcriptions | M4A/AAC-LC | audio/mp4   | 通过 | 1.30       |
| xingchen-transcriptions | M4A/AAC-LC | audio/x-m4a | 通过 | 1.29       |

## 实际 YouTube 音频补测（2026-10-27）

两段均直接调用星辰官方接口，带 response_format=verbose_json 和重复的 segment、word 粒度字段；HTTP 200，未返回 words。

| 音频片段                            | 实际文件时长 | 返回分段            | 结果                                        |
| ----------------------------------- | ------------ | ------------------- | ------------------------------------------- |
| youtube-e3iQy15SWFk-28720-37920.m4a | 9.241542 秒  | 0–7.000 秒，共 1 段 | 两句话均在同一个 segment                    |
| youtube-e3iQy15SWFk-18960-28720.m4a | 9.775601 秒  | 0–9.599 秒，共 1 段 | simulation. 与 The robot 之间未提供时间边界 |

默认请求两段均只返回 text。上述带参数请求证明支持的是厂家分段时间戳，不能保证逐句或逐词时间。不能由简单生成样本返回多段推断真实连续语音一定逐句拆分。
