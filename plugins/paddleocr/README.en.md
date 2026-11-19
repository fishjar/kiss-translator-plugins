# PaddleOCR Official API

[English](README.en.md) | [简体中文](README.md)

KISS Translator maintains this plugin for the official PaddleOCR asynchronous API on Baidu AI Studio. It uses Plugin API 1 and supports KISS Translator 2.2.5 and later.

| Service | Verified models | Output |
| --- | --- | --- |
| Text OCR | PP-OCRv6 (default), PP-OCRv5, PP-OCRv5-latin | Recognized text with line polygons |
| Document parsing | PaddleOCR-VL-1.6 (default), PaddleOCR-VL-1.5, PP-StructureV3 | Whole-image text and layout blocks, including detected tables and formulas |

## Setup

1. In Interface Plugins, install PaddleOCR from the official catalog or import its ZIP.
2. Add the required service in Service Configuration, enter an [AI Studio Access Token](https://aistudio.baidu.com/account/accessToken), and choose a model. The menus contain only the verified models listed above.
3. Select the service for image recognition. On hosts that prioritize whole-image recognition, document parsing skips automatic analysis by a separate layout service. Version 2.2.5 uses the configured layout and cropping workflow. For PDF translation, the host identifies regions before sending region images for recognition.

Document parsing reads ordered layout blocks when a page provides them. Text without coordinates still goes to translation. Pages without usable blocks fall back to Markdown. Document parsing runs in whole-image mode.

Whole-image document parsing uses the selected model and task parameters and requires no prompt. The plugin extracts source text and layout. The selected translation service produces the translation.

The API base URL defaults to `https://paddleocr.aistudio-app.com`. For a compatible gateway, enter its base URL. The plugin appends `/api/v2/ocr/jobs` and sends images and the access token to that endpoint. Jobs have a 100-second budget and can end sooner at the host deadline.

On 2.2.5, add `https://paddleocr.aistudio-app.com` on its own line in Basic Settings → Disable Origin list before using the official endpoint. Hosts that support plugin Origin declarations manage this rule automatically.

The plugin downloads results from presigned HTTPS URLs. Common Baidu Object Storage origins are built in. If the returned download origin is denied, enter its HTTPS origin in Additional result download origin. Result downloads omit the access token.

[Official API documentation](https://www.paddleocr.ai/latest/en/version3.x/inference_deployment/serving/paddleocr_official_api/typescript.html) · [Acceptance notes](ACCEPTANCE.md) · [Original contribution by Gouzau-cn](https://github.com/fishjar/kiss-translator-plugins/pull/7)
