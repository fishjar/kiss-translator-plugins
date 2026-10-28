# KISS Translator Official Plugins

[English](README.en.md) | [简体中文](README.md)

Service adapter plugins maintained by the KISS Translator project. Plugins are installed over the network; using services typically requires an API key and internet connectivity.

## Plugins

| Plugin | Capabilities |
| ------ | ------------ |
| [DeepSeek](plugins/deepseek/README.en.md) | Chat, translation, AI dictionary, subtitle segmentation, streaming output, and thinking mode. |
| [OpenAI Compatible Protocol](plugins/openai-compatible-bundle/README.en.md) | Chat, translation, AI dictionary, subtitle segmentation, speech recognition, speech synthesis, and full-image recognition. |
| [OpenRouter](plugins/openrouter/README.en.md) | Chat, translation, AI dictionary, subtitle segmentation, Whisper/Qwen speech recognition, Gemini/Qwen speech synthesis, and Jev decisions. |
| [SiliconFlow](plugins/siliconflow/README.en.md) | Chat, translation, AI dictionary, subtitle segmentation, Qwen & XingChen speech recognition, PaddleOCR & DeepSeek OCR full-image recognition. |

These adapter plugins are maintained by KISS Translator and do not represent endorsement or official release by the respective service providers.

## Development and Publishing

Requires Node.js 22. Run `npm ci`, `npm test`, `npm run build`. Artifacts are generated in `dist/`. Each ZIP contains `manifest.json` at its root and only includes implementations and assets, excluding account credentials or development files.

Each plugin independently increments its manifest version; overwriting published versions is forbidden. After merging to `main`, GitHub Actions validates and atomically publishes the catalog and versioned ZIPs to the `dist` branch. Legacy version archives are retained; the plugin catalog only points to the latest version of each plugin. Catalog URL:

https://raw.githubusercontent.com/fishjar/kiss-translator-plugins/dist/catalog.json

Plugins can be installed via the "Service Plugins" page in KISS Translator or imported after downloading the ZIP. The official repository contains multiple plugins; do not use the repository root URL as a single-plugin installation URL.

All current official plugins use numeric `apiVersion: 1` and require a host supporting Plugin API 1. The development stage is not backwards-compatible with legacy contracts; please re-import packages and create new instances.

For directory structure, protocol testing, and CI publishing steps of new official plugins, as well as protocol and SDK contracts, see the [Plugin Development Guide](docs/plugin-development-guide.en.md). [Signed Dictionary](examples/signed-dictionary/README.md) is solely an educational development example and is not distributed as an official service.

External plugin authors can add the `kiss-translator-plugin` topic to public repositories for host auto-discovery; one repository corresponds to one plugin, and the default branch root must contain `manifest.json`. The topic does not imply official verification.

This project is licensed under the [MIT License](LICENSE). Parts of the source code are migrated from fishjar/kiss-translator, preserving original project and contributor attributions; the host repository license is maintained independently. Release ZIPs include the full license text.

The four official plugins reference package-internal `assets/logo.png` via Manifest `icon`, loaded locally after installation and displayable offline. If an instance and local template versions mismatch, templates are missing, or icon decoding fails, it falls back to the default icon. Existing instances must match new templates through the host's existing upgrade process. Icons do not sync across devices with instances. Brand graphics for DeepSeek, OpenRouter, and SiliconFlow belong to their respective owners; the code's MIT license does not relicense brand assets; sources and original assets can be found in each plugin's `assets/SOURCES.md`. The OpenAI Compatible plugin uses a neutral interface connection icon.

Build and publish only prune retired distribution directories (`example-deepseek`, `example-openai-compatible-bundle`), preserving historical ZIPs and other files for active plugins. Direct download links for retired examples will become unavailable once pruning takes effect; existing instance snapshots are not deleted, but templates can no longer be restored via old links. Remote cleanup takes effect with normal release commits without rewriting branch history.

## Local Validation and Publishing Gate

Only requires this repository and Node.js 22: `npm ci`, `npm run check`, `npm test`, `npm run build`. `check -- <directory or ZIP>` checks a single package; without arguments, it checks all official plugins. Default tests cover packaging and provider adaptation logic, using SDK test doubles without reading or downloading host source code.

`npm run test:host` is an optional real host SDK integration test requiring host source code and dependencies, configurable via `KISS_TRANSLATOR_ROOT`. It is not a prerequisite for default CI, packaging, or publishing, nor is it pinned to host branches or commit SHAs. Default tests also verify setting labels in official plugins across all eight languages; this metadata requirement does not restrict third-party plugin loading.

To verify in GitHub Actions, manually run [Optional host compatibility](.github/workflows/compatibility.yml), requiring `host_ref` to specify a branch, tag, or commit of `fishjar/kiss-translator`. The workflow records actual commit SHAs of both repos, using real host SDK, parser, and executor with mock HTTP responses; no provider keys are required, and no publishing is executed. It is not triggered automatically, is not a required check for merge, and does not block publishing workflows; no changes are required in the main repo. Workflows that have not actually run cannot be considered to have passed online acceptance.

Model parameter branching is a plugin adaptation strategy; standalone tests verify request construction logic, and host integration tests verify execution behavior under specified source versions, but neither proves all real models accept these parameters. Real services and browser acceptance require valid credentials and actual calls, with verified versions and results recorded separately.

`apiVersion: 1` is the sole plugin contract version, covering manifest, rules, and SDK capabilities; `manifestVersion` / `rulesVersion` are no longer used. Plugin versions and host release versions remain independent. The publisher validates independently without relying on host source code.

Current verification results and browser acceptance boundaries can be found in [Plugin API 1 Acceptance Record](docs/plugin-api-1-acceptance.md).
