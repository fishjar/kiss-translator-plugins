# Qianwen AI

English | [简体中文](README.md)

Install Qianwen AI from Service Plugins in KISS Translator, or import the built ZIP. Add each service you want to use and enter a pay-as-you-go Qianwen AI Platform API key. Each service instance stores its own configuration. [Get an API key](https://platform.qianwenai.com/docs/api-reference/preparation/api-key)

| Service | Model | Use |
| --- | --- | --- |
| Chat and Translation (LLM) | `qwen3.8-flash`, `qwen3.8-max` | Flash is the default. Text and image chat, single and batch translation, AI dictionary, and subtitle segmentation. Chat, translation, and dictionary support streaming. Thinking is off by default. |
| Speech Recognition (with Timestamps) | `qwen-audio-3.1-asr-flash` | Short audio transcription with sentence timing and valid word timing when available. Use for precise YouTube subtitle alignment. |
| Image Text Extraction | `qwen3.5-ocr` | Extracts text from screenshots and scanned pages. |
| Multimodal Recognition | `qwen3.8-omni-flash` | Image text extraction and short audio transcription without timestamps. KISS Translator aligns YouTube subtitles to audio chunks. |

Chat, image extraction, and Omni use OpenAI-compatible Chat Completions. Timestamped ASR uses Qianwen's native HTTP endpoint. Live checks covered WAV and host-remuxed AAC-LC M4A. The dedicated ASR can return HTTP 400 for silent input. Omni returned an empty transcript for the silence sample. [Dedicated ASR](https://platform.qianwenai.com/docs/api-reference/speech-recognition/qwen-audio-asr/http-api) · [Omni](https://platform.qianwenai.com/docs/developer-guides/speech/multimodal-speech)

All four services accept a custom model ID. Choose a model that supports the selected service's protocol and capabilities.

Preview the image prompts in the plugin list and choose a preset in the service settings. Image Text Extraction and Multimodal Recognition both default to Plain text recognition and offer Document to Markdown and Table extraction. The dedicated OCR service also offers Formula extraction (LaTeX), while Omni offers Chart analysis and Image description. Existing instances can be upgraded to the new template snapshot.

Image services accept one image and return full text. KISS Translator can rasterize scanned PDF pages before sending them to the service. See the [acceptance record](ACCEPTANCE.md) for the tested scope.
