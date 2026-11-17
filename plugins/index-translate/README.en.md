# Index-Translate

Requires KISS Translator 2.2.6 or later with structured image parsing. Plugin API 1.

Uses `https://index-translate.bilibili.com/v1` and `Index-Translate-35B-A3B` by default; no API key is required. Supports single-item text translation and image parsing. No batch, layout or OCR-coordinate support is advertised.

Select the vision service and an original-text, image-translation or bilingual prompt in the image/screenshot panel. Valid translations bypass text translation; missing translations are filled using the selected text service when source text is available. Recognition-only never invokes fallback translation. Existing prompt selections remain unchanged.

Image requests allow 4096 output tokens; truncated responses fail. Results are text, not repainted images. Public availability, rate limits and pricing policy belong to the provider. 2B/9B image capability and layout quality are not verified.

Publish only after the matching host release. Existing 2.2.5 installations cannot install this package.

## Browser Origin setup

The plugin declares the official domain in `permissions.originRewrite`. Supporting hosts deduplicate declarations from enabled, configured instances together with the user's list. No manual entry is required. Shared domains remain active until their last plugin contributor disappears, and user entries are always retained. Installing only a template does not activate rules.

The saved user list is never edited, including previously added Index entries. Rules are not installed or removed per request and do not serialize concurrent requests. They affect extension-originated requests to the declared target origin.

The public gateway may reject an extension Origin with HTTP 412; the host rewrites it to the target origin. No User-Agent override is needed. Browsers without the required API can use a separately hosted compatible gateway or local bridge. Custom endpoints are not automatically added to the rewrite list.

See ACCEPTANCE.md for validation and limitations. Layout accuracy is not advertised.
