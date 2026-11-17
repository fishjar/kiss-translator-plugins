# Acceptance — 2026-11-17

## Automated

Publisher/package and protocol suites: 45 + 29 passed. Host integration suite: 133 passed, including real package loading, script interpretation, asset encoding, structured prompts, text translation, truncation and minimum-version rejection. Development commands use `KISS_TRANSLATOR_ROOT` pointing to the matching host branch and `KISS_TRANSLATOR_TEST_VERSION=2.2.6`; the test-only version override does not change production code.

## Live API

A generated image containing “Hello world. Keep the door closed.” was sent through the actual Index plugin SDK/script path. Original, translation-only and bilingual presets passed. The updated OpenAI-compatible adapter against the same public 35B endpoint also passed bilingual parsing. The dedicated Index single-item text preset returned only the intended source translation.

Initial long generic JSON instructions were unstable; the committed shorter shared contract and explicit preset shapes passed subsequent requests. These are simple-sample checks, not evidence of robust complex-document quality.

## Browser

An unpacked development Chrome/Edge extension was tested with isolated test snapshots. Only those browser-test snapshots used a 2.2.5 compatibility floor because the development host has not been version-bumped; production manifests retain 2.2.6, and their rejection on 2.2.5 is tested separately.

The public endpoint initially returned HTTP 412. User-Agent rewriting alone did not help. The existing host Origin-list setting with `https://index-translate.bilibili.com` resolved it. No new automatic global header rules were added.

Actual extension background tasks passed translation-only, bilingual, recognition-only, and source-to-text-fallback paths. Both direct translation cases deliberately used a nonexistent fallback reference and still succeeded. The webpage image panel displayed original/translation for bilingual output, and translation-only output disabled original/bilingual tabs. Testing used a synthetic local image, not private user content.

## Limits

Firefox/Safari, a different vision model, complex documents, real layout accuracy and long-term public service availability are not verified. No layout capability is advertised for Index. No plugin release, tag or issue closure was performed. Publish only after the supporting host release; confirm the final version before publishing.
