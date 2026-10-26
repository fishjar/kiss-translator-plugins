# SiliconFlow 1.0.0 实测记录

日期：2026-10-26。使用真实 SiliconFlow API 和用户授权的测试密钥完成以下请求；密钥未写入源码或报告。

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
