# Index-Translate

Requires KISS Translator 2.2.6 or later with structured image parsing. Plugin API 1.

Uses `https://index-translate.bilibili.com/v1` and `Index-Translate-35B-A3B` by default; no API key is required. Supports single-item text translation and image parsing. No batch, layout or OCR-coordinate support is advertised.

Select the vision service and an original-text, image-translation or bilingual prompt in the image/screenshot panel. Valid translations bypass text translation; missing translations are filled using the selected text service when source text is available. Recognition-only never invokes fallback translation. Existing prompt selections remain unchanged.

Image requests allow 4096 output tokens; truncated responses fail. Results are text, not repainted images. Public availability, rate limits and pricing policy belong to the provider. 2B/9B image capability and layout quality are not verified.

Publish only after the matching host release. Existing 2.2.5 installations cannot install this package.

## Browser Origin setup

In the tested Chrome/Edge extension environment, the public gateway returns HTTP 412 for the extension Origin. Search settings for “Disabled Origin List” and append `https://index-translate.bilibili.com` without `/v1`, preserving existing entries. This uses the host's existing same-origin Origin rewrite. No User-Agent override is needed. The plugin does not change global rules automatically. Browsers without this feature can use a separately hosted compatible gateway or local bridge.

Original recognition, translation-only and bilingual responses were verified. Both direct translation cases succeed even when the fallback service is an intentionally unavailable test reference. Recognition-only does not invoke fallback. Layout accuracy is not verified or advertised.
