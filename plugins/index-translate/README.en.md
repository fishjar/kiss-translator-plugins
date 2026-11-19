# Index-Translate

Requires KISS Translator 2.2.6 or later with structured image parsing. Plugin API 1.

Uses the free public endpoint `https://index-translate.bilibili.com/v1` and `Index-Translate-35B-A3B` by default; no API key is required. `freeTier: "free"` declares the default service free. Supports single-item/batch text translation and image parsing. Layout and OCR coordinates are not advertised.

Text presets include default, concise and standard single-item prompts with English instructions, plus JSON/XML/LINE batch prompts. The default single-item ID is unchanged; JSON is the batch default. Batches allow at most eight items, with 4096 output tokens and no streaming. Index-specific copies place instructions before the source and reinforce glossary, tag and placeholder requirements; host presets and other plugins remain unchanged. Existing 1.0.0/1.0.1 instances require an explicit upgrade to 1.0.2, retaining saved prompt selections, batch settings and enabled capabilities.

Hover the visual-parsing capability label to inspect translation/layout declarations; actual output still depends on the prompt and model. Dictionary and subtitle presets were evaluated but did not meet content requirements, so these capabilities are not advertised.

Select the vision service and an original-text, image-translation or bilingual prompt in the image/screenshot panel. Valid translations bypass text translation; missing translations are filled using the selected text service when source text is available. Recognition-only never invokes fallback translation. Existing prompt selections remain unchanged.

Image requests allow 4096 output tokens; truncated responses fail. Results are text, not repainted images. Public availability, rate limits and pricing policy belong to the provider. 2B/9B image capability and layout quality are not verified.

Publish only after the matching host release. Existing 2.2.5 installations cannot install this package.

## Browser Origin setup

The plugin declares the official domain in `permissions.originRewrite`. Supporting hosts deduplicate declarations from enabled, configured instances together with the user's list. No manual entry is required. Shared domains remain active until their last plugin contributor disappears, and user entries are always retained. Installing only a template does not activate rules.

The saved user list is never edited, including previously added Index entries. Rules are not installed or removed per request and do not serialize concurrent requests. They affect extension-originated requests to the declared target origin.

The public gateway may reject an extension Origin with HTTP 412; the host rewrites it to the target origin. No User-Agent override is needed. Browsers without the required API can use a separately hosted compatible gateway or local bridge. Custom endpoints are not automatically added to the rewrite list.

See ACCEPTANCE.md for validation and limitations. Layout accuracy is not advertised.
