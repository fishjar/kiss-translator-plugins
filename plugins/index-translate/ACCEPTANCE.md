# Acceptance — 2026-11-17 / 2026-11-18

## 1.0.2 text presets and metadata — 2026-11-18

Index 1.0.2 declares its default public service free (`isFree: true`). The host displays a green Free badge after the installed version, following an update badge when present. Image parsing declarations are read-only tooltips on the capability label; Index declares translation support and leaves layout undeclared. The OpenAI-compatible vision adapter declares both. Metadata does not enable tasks or change requests.

The default single-item preset keeps its ID but now uses English instructions, following live validation. Concise and standard single-item presets plus JSON/XML/LINE batch presets adapt existing host/official templates inside Index only. Instructions precede source input. Batch support is limited to eight items, non-streaming, 4096 output tokens. Explicit upgrades from 1.0.0/1.0.1 preserve prompt references, batch preferences and enabled capabilities.

Automated validation: 756 host tests across 62 relevant suites passed; subsequent badge-position assertions passed in the 25-test plugin UI suite. Package/publisher tests: 47; protocol tests: 29; host integration tests: 146, including 13 Index text-preset tests. These cover prompt selection/copy/export/import, stable IDs and protocol parsing, malformed/missing/duplicate/truncated output, batch admission and explicit upgrades. The host queue test splits 17 paragraphs into 8/8/1. Chrome build and package checks are recorded with the delivery.

Live results are recorded in [ACCEPTANCE-live-20261118.json](ACCEPTANCE-live-20261118.json): 22 current-preset checks passed. The English default covers English-to-Chinese, automatic Japanese-to-Chinese, Chinese-to-English, English-to-Japanese, empty glossary/paragraph breaks, and code/placeholders. Other single-item presets cover explicit/automatic source languages. Each batch protocol covers two/eight items and explicit/automatic source languages. Checks include IDs, glossary values (including empty-value preservation), HTML tags, placeholders, newlines, separators and exclusion of context instructions; representative output was also inspected for meaning. One XML eight-item request returned HTTP 504; retry returned HTTP 200. This gateway error is preserved separately from content/protocol failures.

Dictionary assessment returned only translations for single-word samples instead of dictionary sections. Subtitle assessment produced one valid simple result, but another translated the source `text` field and ignored terminology. Neither capability is advertised. Finite examples do not establish general reliability or service availability.

## Automated

Publisher/package and protocol suites: 46 + 29 passed. Host integration suite: 133 passed, including real package loading, script interpretation, asset encoding, structured prompts, text translation, truncation and minimum-version rejection. Development commands use `KISS_TRANSLATOR_ROOT` pointing to the matching host branch and `KISS_TRANSLATOR_TEST_VERSION=2.2.6`; the test-only version override does not change production code. Publisher `npm run check` also passed after adding Origin permissions.

## Live API

A generated image containing “Hello world. Keep the door closed.” was sent through the actual Index plugin SDK/script path. Original, translation-only and bilingual presets passed. The updated OpenAI-compatible adapter against the same public 35B endpoint also passed bilingual parsing. The dedicated Index single-item text preset returned only the intended source translation.

Initial long generic JSON instructions were unstable; the committed shorter shared contract and explicit preset shapes passed subsequent requests. These are simple-sample checks, not evidence of robust complex-document quality.

## Browser

An unpacked development Chrome/Edge extension was tested with isolated test snapshots. Only those browser-test snapshots used a 2.2.5 compatibility floor because the development host has not been version-bumped; production manifests retain 2.2.6, and their rejection on 2.2.5 is tested separately.

The public endpoint initially returned HTTP 412. User-Agent rewriting alone did not help; setting Origin to `https://index-translate.bilibili.com` resolved it. The new package declares this exact origin in `permissions.originRewrite`. On the updated host, a clean unpacked development extension generated one automatic rule for both Index instances, without adding the domain to the user's saved Origin list. Bilingual image parsing returned original text and translation with a deliberately nonexistent fallback service. Reloading the extension preserved the correct rules and a real text request returned HTTP 200.

Disabling one contributing instance retained the shared rule; disabling both removed it. Adding the same origin to the user list retained a user-priority rule even with both instances disabled. The test-only user entry was then removed and both instances re-enabled. Saved Origin settings remained at their original value throughout the automatic-rule checks.

Actual extension background tasks passed translation-only, bilingual, recognition-only, and source-to-text-fallback paths. Both direct translation cases deliberately used a nonexistent fallback reference and still succeeded. The webpage image panel displayed original/translation for bilingual output, and translation-only output disabled original/bilingual tabs. Testing used a synthetic local image, not private user content.

## Limits

Firefox/Safari, a different vision model, complex documents, real layout accuracy and long-term public service availability are not verified. No layout capability is advertised for Index. No plugin release, tag or issue closure was performed. Publish only after the supporting host release; confirm the final version before publishing.
