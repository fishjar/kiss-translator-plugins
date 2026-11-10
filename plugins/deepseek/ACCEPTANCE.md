# DeepSeek 1.3.0 图片识别验收

| 层级 | 结果 |
| --- | --- |
| 插件检查与打包 | `npm run check`、`npm test`（48 项）和 `npm run build` 通过。对生成的 `dist/deepseek/1.3.0.zip` 再运行插件检查，确认包含对话与翻译、图片全文识别两个服务。 |
| 宿主集成 | `npm run test:host` 通过 72 项。新增用例验证用户消息中的图片 Data URL、Bearer 鉴权、无坐标 Markdown 结果，以及 HTTP 错误和空响应。 |
| 真实 API | 用 `deepseek-flash`、关闭思考、非流式调用官方 Chat Completions。PNG 截图和 JPEG 模拟扫描页均返回 HTTP 200，三行已知原文均按阅读顺序提取。 |
| Chrome 扩展 | 在简约翻译 2.2.1 中导入 ZIP。服务添加菜单显示两个 DeepSeek 服务。保存临时 VLM 实例后，从「能力测试 → 视觉解析（VLM）」上传 PNG 截图，返回包含 `DS-1704` 的三行原文和 Markdown 格式。验收后卸载临时扩展。 |

## 1.3.2 VLM 提示词验收

2026-11-10 使用 `deepseek-flash`、关闭思考，逐个验证默认和新增预设。真实请求经宿主包加载器、声明式执行器和传输层发送，均返回 HTTP 200。发出的指令逐字匹配 [vision 服务的 `defaultPrompts.vlm`](manifest.json)。文档、表格和图表为合成样本，照片来自 [scikit-image 样例](https://github.com/scikit-image/scikit-image/blob/v0.25.2/skimage/data/coffee.png)。

| 预设 | 样本 | 判定 |
| --- | --- | --- |
| 文档转 Markdown | 文档截图 | 通过。标题、批次号、两项编号和 URL 按原顺序保留。 |
| 纯文本识别 | 文档截图 | 通过。五行可见文字及编号、标点、URL 均保留，未添加 Markdown 格式。 |
| 表格提取 | 库存表 | 通过。只返回表格，行列准确，空白单元格保留，表外文字省略。 |
| 图表解析 | 月度发货图 | 通过。图例、坐标轴和柱上数值准确，无法读取的标签未被猜测。 |
| 图片描述 | 咖啡照片 | 通过。识别主要物体及可见位置关系，模型对不确定内容作了区分。 |

在简约翻译 Chrome 扩展 2.2.1 导入 1.3.2 ZIP 后，插件列表可预览全部五项，服务配置可选择预设。选中纯文本识别后，在「能力测试」上传文档截图，返回五行原文、可见编号和 URL。

### 真实 API 输出

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
<summary>图表解析 · 月度发货图</summary>

```text
The image displays a grouped bar chart titled "Monthly shipments" in bold black text at the top center.

**Axes and Legend:**
*   **Vertical Axis (Y-axis):** Labeled "Units" in the top left corner. The scale includes numerical markings at 0, 10, 20, 30, and 40. Horizontal grey gridlines extend across the chart from these intervals.
*   **Horizontal Axis (X-axis):** Labeled "Month" at the bottom center. The visible categories are "April" and "May".
*   **Legend:** Located in the top right corner, it shows a blue square representing "North" and an orange square representing "South".

**Data Values:**
*   **April:** The blue bar (North) has a value of 26. The orange bar (South) has a value of 18.
*   **May:** The blue bar (North) has a value of 32. The orange bar (South) has a value of 24.
*   **Third Category:** The label for the third group of bars is replaced by a grey, zigzag scribble, making the month name illegible. In this group, the blue bar (North) is labeled 22, and the orange bar (South) is labeled 27.
```

</details>

<details>
<summary>图片描述 · 咖啡照片</summary>

```text
Based on the image, here is a detailed description:

**Directly Visible Details:**
*   **The Cup and Saucer:** The central focus is a small, thick-walled ceramic cup resting on a matching saucer. Both are a glossy, dark reddish-brown (maroon) color on the exterior. The interior of the cup is white. The cup has a small, rounded handle on the left side.
*   **The Liquid:** Inside the cup is a dark brown liquid with a distinct, lighter tan-colored layer of foam (crema) on top, characteristic of espresso. The liquid level is below the white interior rim.
*   **The Spoon:** A small, polished silver-colored metal spoon rests on the saucer to the right of the cup. The bowl of the spoon is facing upwards, and the handle extends upwards behind the cup.
*   **The Surface:** The cup and saucer are sitting on a wooden surface, likely a table. The wood has a warm, medium-brown tone with visible grain running diagonally across the frame. There are noticeable scratches, dents, and scuff marks on the wood, suggesting wear and tear.
*   **Lighting and Reflection:** The lighting appears warm. There are bright, distinct highlights on the rim of the cup, the handle, the curve of the spoon, and the surface of the liquid, indicating a light source from above and slightly to the left. The glossy finish of the saucer also reflects the surroundings.

**Uncertain Interpretations:**
*   The specific type of wood is unclear, though it appears to be a solid hardwood.
*   While the beverage looks like espresso, it is an interpretation based on the size of the cup and the crema; it could be a strong coffee or a similar dark drink.
*   The exact setting (e.g., a cafe, a home) is not visible, only the table surface is shown.
```

</details>
