# PaddleOCR Official API

[English](README.en.md) | [简体中文](README.md)

KISS Translator maintains this plugin for the official PaddleOCR asynchronous API on Baidu AI Studio. It requires KISS Translator 2.2.6 or later.

| Service | Verified models | Output |
| --- | --- | --- |
| Text OCR | PP-OCRv6 (default), PP-OCRv5, PP-OCRv5-latin | Recognized text with line polygons |
| Document parsing | PaddleOCR-VL-1.6 (default), PaddleOCR-VL-1.5, PP-StructureV3 | Whole-image text and layout blocks, including detected tables and formulas |

## Setup

1. In Interface Plugins, install PaddleOCR from the official catalog or import its ZIP.
2. Add the required service in Service Configuration, enter an [AI Studio Access Token](https://aistudio.baidu.com/account/accessToken), and choose a model. If you type a model outside the menu, the service uses its default.
3. Select the service for image recognition. Document parsing includes layout analysis, so whole-image recognition skips a separate layout service. For PDF translation, the host identifies regions before sending region images for recognition.

Document parsing reads ordered layout blocks when a page provides them. Text without coordinates still goes to translation. Pages without usable blocks fall back to Markdown. Document parsing runs in whole-image mode.

Whole-image document parsing uses the selected model and task parameters and requires no prompt. The plugin extracts source text and layout. The selected translation service produces the translation.

The API base URL defaults to `https://paddleocr.aistudio-app.com`. For a compatible gateway, enter its base URL. The plugin appends `/api/v2/ocr/jobs` and sends images and the access token to that endpoint. Jobs have a 100-second budget and can end sooner at the host deadline.

The plugin downloads results from presigned HTTPS URLs. Common Baidu Object Storage origins are built in. If the returned download origin is denied, enter its HTTPS origin in Additional result download origin. Result downloads omit the access token.

[Official API documentation](https://www.paddleocr.ai/latest/en/version3.x/inference_deployment/serving/paddleocr_official_api/typescript.html) · [Acceptance notes](ACCEPTANCE.md) · [Original contribution by Gouzau-cn](https://github.com/fishjar/kiss-translator-plugins/pull/7)
