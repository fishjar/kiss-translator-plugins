# 千问 AI 1.0.0 验收记录

日期为 2026-11-10。宿主集成使用简约翻译源码 `1c46c6e2`，浏览器使用本地 Chrome 扩展 2.2.1。

| 验收项 | 结果 |
| --- | --- |
| 独立检查与构建 | Manifest 和 ZIP 校验通过。47 个独立测试和 70 个宿主集成测试通过。 |
| 真实翻译 | Flash 和 Max 均通过思考开关测试，并在流式、非流式聚合翻译中保留两个译文 ID。 |
| 真实专用 ASR | 两句英文样本的 WAV 和宿主重新封装的 AAC-LC M4A 都返回两句及词级时间戳。M4A 的句界为 0.28–2.56 秒和 4.52–6.68 秒。非流式接口合并成一个区间，插件从 SSE 中提取两句并去掉累积前缀。 |
| 真实 Omni ASR | WAV 和宿主封装的 M4A 均逐字转写两句话。纯静音返回空转写。 |
| 真实图片识别 | 专用 OCR 和 Omni 均提取出同一张合成截图和模拟扫描页中的两行文字，结果无坐标。 |
| Chrome 扩展 | 最终 ZIP 导入成功并显示四个服务。网页翻译实际渲染中英对照，能力测试界面跑通两种图片识别和两种 M4A 转写。 |
| 字幕对齐 | 宿主字幕分块逻辑使用真实转写结果，在 10–17 秒音频块中将专用 ASR 对齐到 10.28–12.56 秒和 14.52–16.68 秒，将 Omni 对齐到整个音频块。两个公开 YouTube 样片在测试浏览器中显示无法播放，播放端到端尚未验证。 |

专用 ASR 对纯静音样本返回 HTTP 400，厂商响应为 `ASR_RESPONSE_HAVE_NO_WORDS`。宿主的 HTTP Broker 只向插件传递状态码，所以保留 HTTP 错误。宿主已经识别为静音的字幕块会直接跳过 ASR 请求。

## 1.0.2 VLM 提示词验收

2026-11-10 使用 `qwen3.5-ocr` 的完整响应和 `qwen3.8-omni-flash` 的 SSE 响应逐个验证默认和新增预设。真实请求经宿主包加载器和传输层发送，Omni 另经脚本解释器及 SSE 解析，最终指令与 [ocr 和 omni 服务的 `defaultPrompts.vlm`](manifest.json) 逐字相同。下列 13 个最终请求均返回 HTTP 200。照片来自 scikit-image 的 [咖啡照片](https://github.com/scikit-image/scikit-image/blob/v0.25.2/skimage/data/coffee.png) 和 [航天员照片](https://github.com/scikit-image/scikit-image/blob/v0.25.2/skimage/data/astronaut.png)。

| 服务 | 预设 | 样本 | 判定 |
| --- | --- | --- | --- |
| OCR | 文档转 Markdown | 文档截图 | 通过。标题、批次号、两项编号和 URL 按原顺序保留。 |
| OCR | 纯文本识别 | 文档截图 | 通过。五行可见文字及编号、标点、URL 均保留，未添加 Markdown 格式。 |
| OCR | 表格提取 | 库存表、备件表 | 通过。只返回表格，行列准确，空白单元格保留，表外文字省略。 |
| OCR | 公式提取 | 代数公式页 | 通过。只返回 LaTeX。分式、下标和平方与原式等价。 |
| Omni | 文档转 Markdown | 文档截图 | 通过。标题、批次号、两项编号和 URL 按原顺序保留。 |
| Omni | 纯文本识别 | 文档截图 | 通过。五行可见文字及编号、标点、URL 均保留，未添加 Markdown 格式。 |
| Omni | 表格提取 | 库存表、备件表 | 通过。只返回表格，行列准确，空白单元格保留，表外文字省略。 |
| Omni | 图表解析 | 月度发货图、每周签到图 | 通过。图例、坐标轴和柱上数值准确，无法读取的标签未被猜测。 |
| Omni | 图片描述 | 咖啡照片、航天员照片 | 通过。准确描述杯碟、右侧勺子，以及航天员照片里的旗帜、头盔和模型，未推测人物身份。 |

首轮 OCR 表格带代码围栏，Omni 表格包含表外标题和说明，Omni 图表把遮挡的月份猜成 June。Omni 图片描述初稿还推测了饮品容量和新鲜程度，迭代中出现过背景细节和人物身份推测。收紧相关指令后，表格、图表和图片描述分别用原图及第二张同类图复测，结果见下方。

在简约翻译 Chrome 扩展 2.2.1 导入 1.0.2 ZIP 后，OCR 和 Omni 均能预览和选择新预设。通过「能力测试」，OCR 选择公式提取并返回 LaTeX，Omni 选择图表解析并保留 `[unreadable]` 标签和对应的两个柱值。

### 真实 API 输出

#### 千问 OCR

<details>
<summary>文档转 Markdown · 文档截图</summary>

```text
Field Notes

Batch code: RX-714

2. Check the rear latch.

3. Leave the spare pin.

https://example.com/ops
```

</details>

<details>
<summary>纯文本识别 · 文档截图</summary>

```text
Field Notes
Batch code: RX-714
2. Check the rear latch.
3. Leave the spare pin.
https://example.com/ops
```

</details>

<details>
<summary>表格提取 · 库存表</summary>

```text
| Item | North | South |
| --- | --- | --- |
| Clips | 12 | 8 |
| Pins |  | 6 |
```

</details>

<details>
<summary>表格提取 · 备件表</summary>

```text
| Part | West | East |
| --- | --- | --- |
| Belts |  | 9 |
| Seals | 15 | 2 |
```

</details>

<details>
<summary>公式提取 · 代数公式页</summary>

```text
$$y _ { 1 } = { \frac { x ^ { 2 } + 1 } { 2 x } }$$
```

</details>

#### 千问 Omni

<details>
<summary>文档转 Markdown · 文档截图</summary>

```text
# Field Notes

Batch code: RX-714

2. Check the rear latch.
3. Leave the spare pin.

https://example.com/ops
```

</details>

<details>
<summary>纯文本识别 · 文档截图</summary>

```text
Field Notes
Batch code: RX-714
2. Check the rear latch.
3. Leave the spare pin.

https://example.com/ops
```

</details>

<details>
<summary>表格提取 · 库存表</summary>

```text
| Item | North | South |
|---|---|---|
| Clips | 12 | 8 |
| Pins |  | 6 |
```

</details>

<details>
<summary>表格提取 · 备件表</summary>

```text
| Part | West | East |
|---|---|---|
| Belts |  | 9 |
| Seals | 15 | 2 |
```

</details>

<details>
<summary>图表解析 · 月度发货图</summary>

```text
Here's the transcription of the visible elements from the chart:

**Chart Title:** Monthly shipments

**Y-axis Label:** Units

**X-axis Label:** Month

**Legend:**
- North (blue)
- South (orange)

**Category Labels and Data Values (in chart order):**

1. **April**
   - North: 26
   - South: 18

2. **May**
   - North: 32
   - South: 24

3. **[unreadable]**
   - North: 22
   - South: 27
```

</details>

<details>
<summary>图表解析 · 每周签到图</summary>

```text
Based on the provided image, here is the transcription of the chart's elements:

**Chart Title:**
Weekly check-ins

**Y-axis Label:**
Visits

**X-axis Label:**
Day

**Legend:**
Lobby

**Category Labels (in order from left to right):**
1.  Mon
2.  [unreadable]
3.  Wed

**Printed Data Values (for each category in chart order):**
*   **Mon:** 11
*   **[unreadable]:** 16
*   **Wed:** 13
```

</details>

<details>
<summary>图片描述 · 咖啡照片</summary>

```text
A reddish-brown cup with a white interior, containing light brown liquid, sits on a matching reddish-brown saucer. A silver spoon is positioned to the right of the cup on the saucer, all resting on a wooden surface.
```

</details>

<details>
<summary>图片描述 · 航天员照片</summary>

```text
A person wearing an orange suit is positioned in the center foreground, with a black helmet resting on their right side (viewer's right). To the viewer's left of the central figure stands a red, white, and blue flag, while to the viewer's right sits a white and brown model rocket.
```

</details>
