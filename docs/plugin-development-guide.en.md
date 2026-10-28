# Network Service Plugin Development Guide (Plugin API 1)

[English](plugin-development-guide.en.md) | [简体中文](plugin-development-guide.md)

This document is for official and external plugin authors, explaining the files and interfaces required to create, configure, execute, debug, and publish plugins. Basic development does not require cloning the host; new official plugins are developed in this repository according to Section 12.5. Host source code and dependencies are only needed when optionally running real host SDK integration tests.

Contract check: 2026-10-28. Development uniformly uses numeric `apiVersion: 1`; it defines the manifest, declarative syntax, and SDK capabilities simultaneously. Only the integer `1` is accepted; legacy SDKs, string versions, or legacy instances are not compatible, and no automatic conversion or migration is performed. Manifests do not contain `manifestVersion`, and declarative files do not contain `rulesVersion`; the two rule types are distinguished by `format`.

For current automated tests, build artifacts, and real browser verification boundaries, see the [Plugin API 1 Acceptance Record](plugin-api-1-acceptance.md).

## Table of Contents

1. [Concepts and Implementation Approaches](#1-concepts-and-implementation-approaches)
2. [Creating Your First Plugin from Scratch](#2-creating-your-first-plugin-from-scratch)
3. [Manifest Complete Reference](#3-manifest-complete-reference)
4. [Declarative Protocol Rules (protocol)](#4-declarative-protocol-rules-protocol)
5. [Declarative Request Mapping Rules (http)](#5-declarative-request-mapping-rules-http)
6. [Input and Output for 14 Capabilities](#6-input-and-output-for-14-capabilities)
7. [JavaScript and ctx SDK](#7-javascript-and-ctx-sdk)
8. [HTTP, Credentials, and Assets](#8-http-credentials-and-assets)
9. [Public Helpers](#9-public-helpers)
10. [Streaming Output and Batch Translation](#10-streaming-output-and-batch-translation)
11. [Prompts and Profile Parameters](#11-prompts-and-profile-parameters)
12. [Installation, Updating, and Publishing](#12-installation-updating-and-publishing) ([Adding Official Plugins](#125-adding-new-official-plugins-in-this-repository))
13. [Debugging and Troubleshooting](#13-debugging-and-troubleshooting)
14. [Pre-release Checklist](#14-pre-release-checklist)

## 1. Concepts and Implementation Approaches

A network service plugin is a protocol adapter for translation, chat, OCR, transcription, speech synthesis, and other services. It is not a browser extension; it cannot inject web pages, manipulate the DOM, invoke browser extension APIs, or install local inference engines.

| Concept | Meaning | Example |
| ------- | ------- | ------- |
| Plugin Package | Distribution unit containing a Manifest and implementation files | `my-text-provider` |
| Service Interface (`service`) | Capability definition sharing a common set of configurations | Text service providing both `chat` and `translate` |
| Capability (`capability`) | Standard task identifier with fixed input and output schemas | `translate`, `transcribe` |
| Handler (`handler`) | Actual execution function or rule key | `exports.translate` / `handlers.translate` |
| Instance | Independent configuration and implementation snapshot created by the user from a definition | Work account, Personal account |
| Profile / Scenario | User-facing feature that selects an instance and initiates tasks | Webpage translation, Dictionary, Document recognition |

Execution flow: Install → Add Instance → Fill and Save Configuration → Capability Test or Scenario Invocation → Execute Handler → Validate Standard Output.

A single service can implement multiple capabilities without duplicating account, URL, and model configurations for each capability. Capabilities are declared uniformly at the service level; model catalogs only provide IDs and names, and model-level capability declarations are forbidden. All models within the same service must support identical tasks and features, including timestamps, coordinates, streaming, and batching; if capabilities diverge, the service must be split. Models with identical capabilities, requests, response parsing, and configurations can reside in the same catalog; if differences exist in actual protocols, default prompts, or message structures, separate services must be created. Service names use functional descriptions such as "Chat and Translation (LLM)", "Speech Recognition (ASR)", "Speech Synthesis (TTS)", "Full Image Recognition", etc., without vendor names or specific model versions; standalone OCR adapters may include model family names for distinction. Endpoints requiring independent models or parameters should be split into different services. The host will not automatically treat `chat` as `translate`; both must be declared and implemented separately.

| Implementation Approach | Suitable Scenarios | Execution Mechanism |
| ----------------------- | ------------------ | ------------------- |
| `declarative` + `format: "protocol"` | Chat Completions-compatible text chat, translation, full image recognition | Host handles messages, protocol parsing, and streaming events |
| `declarative` + `format: "http"` | Single fixed HTTP request and fixed JSON mapping, or retrieving audio assets | Host parses fixed value-mapping nodes |
| `script` | Custom protocols, complex branching, request signing, and custom result transformations | Single-file JS executed inside a Sval Worker |

External packages cannot use `native`. `protocol` is not a field superset of `http` and they cannot be mixed within the same handler; a single package may have different services referencing `http`, `protocol`, and JS files respectively.

Scenarios save instance IDs (`apiSlug`), which authors do not generate or manage. Available capabilities are determined by the intersection of "Service Declarations ∩ User-Enabled Capabilities", and must satisfy scenario constraints such as coordinates and timestamps. Declaring a capability does not imply that every UI surface provides an entry point for it.

Instances clone implementations, settings fields, capabilities, model catalogs, default prompts, and resources independently. Updating a template does not modify existing instances; uninstalling a template does not delete instance snapshots.

## 2. Creating Your First Plugin from Scratch

The following two files form a complete plugin providing text chat, batch translation, and streaming output. Assuming the service uses a Chat Completions-compatible protocol capable of outputting ID-mapped translation JSON according to prompts; for other protocols, see Sections 5 and 7. Prior to development, you only need a text editor, a browser extension supporting "Service Plugins", service endpoints, and test credentials; Node.js is only needed for optional self-checks.

### 2.1 Directory Structure

Create the following directory structure using a text editor, saved in UTF-8, without needing an npm project or build tools:

```text
my-text-provider/
├── manifest.json
└── services/
    └── text.json
```

### 2.2 manifest.json

Copy the complete JSON. `example.invalid` is an unreachable placeholder address to be replaced with a real address after installation; `model` must also be filled with a real model ID. Replace `id`/`name` upon release, and do not put API keys in default values.

```json
{
  "id": "my-text-provider",
  "name": "My Text Service",
  "version": "1.0.0",
  "apiVersion": 1,
  "permissions": { "endpointFields": ["baseUrl"] },
  "sharedSettings": [
    {
      "key": "baseUrl",
      "label": "API Base URL (including protocol prefix, e.g. /v1)",
      "type": "text",
      "defaultValue": "https://example.invalid/v1",
      "required": true
    },
    {
      "key": "apiKey",
      "label": "API Key",
      "type": "password",
      "required": true
    }
  ],
  "services": [
    {
      "id": "text",
      "name": "Text Chat and Translation",
      "implementation": {
        "kind": "declarative",
        "entry": "services/text.json"
      },
      "capabilities": {
        "chat": {
          "handler": "chat",
          "inputModalities": ["text"],
          "outputModes": ["complete", "stream"]
        },
        "translate": {
          "handler": "translate",
          "batch": { "supported": true, "maxItems": 20 },
          "outputModes": ["complete", "stream"]
        }
      },
      "settings": [
        { "key": "model", "label": "Model ID", "type": "text", "required": true }
      ]
    }
  ]
}
```

### 2.3 services/text.json

Copy the complete rules without writing any JavaScript:

```json
{
  "format": "protocol",
  "handlers": {
    "chat": {
      "protocol": "openai-chat-completions",
      "task": "chat",
      "request": {
        "baseUrl": { "$ref": "config.baseUrl" },
        "model": { "$ref": "config.model" },
        "auth": { "type": "bearer", "secret": { "$secret": "apiKey" } }
      }
    },
    "translate": {
      "protocol": "openai-chat-completions",
      "task": "translate",
      "request": {
        "baseUrl": { "$ref": "config.baseUrl" },
        "model": { "$ref": "config.model" },
        "auth": { "type": "bearer", "secret": { "$secret": "apiKey" } }
      }
    }
  }
}
```

`chat` uses task `messages`; for `translate`, the SDK generates default translation messages, parses JSON, and aligns translations by input IDs. Credentials are injected by the host after scope verification on the origin; rules never read secrets in plaintext.

### 2.4 Installation and Verification

1. In extension settings, go to "Service Plugins → Import Folder" and select `my-text-provider` (with `manifest.json` directly at its root).
2. Confirm the plugin is installed and review declared network addresses in the plugin list.
3. In "Service Configuration → Add → Plugin Service", select "Text Chat and Translation" to create an instance.
4. Fill in your real base URL, API Key, and model ID, then save. When `baseUrl` is `https://api.example.com/v1`, requests are sent to `https://api.example.com/v1/chat/completions`; do not enter full endpoints.
5. In Capability Test below, select `chat`, enter "Hello", and run; a text response should appear.
6. Select `translate`, enter "Hello", and run; a Chinese translation should appear (testing default target `zh-CN`).
7. Toggle streaming on and off respectively to verify, then test in actual scenarios such as webpage translation.

If the service does not support streaming, change both `outputModes` to `["complete"]`. If translation only returns plain text, `protocol` JSON parsing will not apply; use `script` for custom transformations instead.

The ZIP root must contain `manifest.json` and `services/`, without an extra wrapping folder. PowerShell example (run from the parent folder):

```powershell
Compress-Archive -Path .\my-text-provider\* -DestinationPath .\my-text-provider.zip
```

Modifying source files will not automatically update installed templates or existing instances. Increment the version, manually update the template, and then create or upgrade instances (see Section 12).

## 3. Manifest Complete Reference

The Manifest uses standard JSON and does not support comments or trailing commas. Paths are relative to the package root, use `/`, and cannot use absolute paths, backslashes, colons, or `.` / `..` segments.

### 3.1 Top-Level Fields

| Field | Type / Requirement | Rule |
| ----- | ------------------ | ---- |
| `id` | String, required | Stable ID matching `^[a-z][a-z0-9-]{1,100}$`, 2–101 characters |
| `name` | String | Display name of the plugin |
| `version` | String, required | Three-part semantic version (e.g. `1.0.0`), without `v` prefix, pre-release, or build suffixes |
| `apiVersion` | Number, required | Fixed integer `1`; does not accept strings, missing values, or legacy formats |
| `services` | Non-empty array, required | Service definitions |
| `sharedSettings` | Optional array | Shared configuration field definitions; instance values remain independent |
| `permissions` | Optional object | `network` and `endpointFields` |
| `icon` | Optional string | Package-relative PNG/JPEG/WebP path, max 256 KiB |
| `resources` | Optional array | `{id, path, mimeType}`, see Section 8 |

Icons are stored locally and are not cloned into instances; if a template is missing, uninstalled, or decoding fails, default icons are used without affecting execution. Do not rely on undefined fields to steer behavior.

### 3.2 Service Fields

| Field | Description |
| ----- | ----------- |
| `id` | Package-unique, stable ID matching `^[A-Za-z][\w-]{0,100}$` |
| `name` | Display name of the service |
| `implementation.kind` | `script` or `declarative`; `native` is forbidden |
| `implementation.entry` | Existing package-relative JS / JSON path |
| `capabilities` | Non-empty object whose keys are standard capabilities defined in Section 6 |
| `settings` | Service-specific configuration fields, merged with `sharedSettings` |
| `modelField` | Key of the model field; defaults to `model` if omitted |
| `models` | Optional non-empty recommended model catalog, see Section 3.6 |
| `defaultPrompts` | Optional default templates, see Section 11 |

Service IDs, handlers, field keys, and resource IDs must not be `__proto__`, `constructor`, or `prototype`. In JS, each entry point must be a self-contained single file without runtime loading of other scripts or npm packages; dependencies must be bundled beforehand.

### 3.3 Capability Descriptions

```json
{
  "translate": {
    "handler": "translate",
    "batch": { "supported": true, "maxItems": 20 },
    "outputModes": ["complete", "stream"],
    "inputModalities": ["text"]
  }
}
```

| Property | Rules and Defaults |
| -------- | ------------------ |
| `handler` | Required string matching `^[A-Za-z_$][\w$]*$`, corresponding to `exports` or `rules.handlers` |
| `batch` | When provided, `supported` must be boolean, and `maxItems` is an optional positive integer; when unsupported, multi-item `translate` calls are rejected |
| `outputModes` | Non-empty array containing `complete` and/or `stream`; defaults to `complete` |
| `inputModalities` | Non-empty array containing `text`, `image`, and/or `audio`; chat defaults to text only |
| `coordinates` | Boolean; when `true`, valid text coordinates must be returned |
| `timestamps` | Boolean; transcribe requires segments by default according to declaration; overridden if explicitly passed in the call |
| `taskModes` | Non-empty array containing `doc`, `table`, and/or `formula`; image tasks default to doc only |

Batch, stream, coordinates, and timestamps are features, not capability names. Only declare features that are actually implemented; for executor constraints, see Sections 4 and 5. Streaming handlers must also return complete results.

### 3.4 Configuration Fields

```json
{
  "key": "translationTemperature",
  "label": "Translation Temperature",
  "type": "number",
  "defaultValue": 0,
  "min": 0,
  "max": 2,
  "visibleForCapabilities": ["translate"]
}
```

| Property | Rules |
| -------- | ----- |
| `key` | Required, matches `^[A-Za-z_$][\w$]*$`; read via `config[key]` in JS |
| `label` | Form label text |
| `type` | Required: `text`, `password`, `number`, `boolean`, or `select` |
| `defaultValue` | Optional, matches type; never pre-populate real credentials |
| `required` | Optional boolean; missing/null/whitespace strings are considered empty |
| `isSecret` | `password` is automatically secret; other fields can set explicitly to `true` |
| `min`/`max` | Finite numbers for `number` type, where `min <= max` |
| `options` | Array of `{label, value}` for `select`, where `value` is string or number |
| `optionsSource` | Shared source for `select` (currently `speech.voices.openai.tts-1`), mutually exclusive with `options` |
| `visibleForCapabilities` | Non-empty, deduplicated array of capabilities; shown when any associated capability is enabled |

`text`/`password` values must be strings, `number` must be finite numbers, and `boolean` must be booleans. `select` strictly matches option values and types; string `"1"` does not equal number `1`. When a service field overrides a shared field with the same key, its type and secret properties must match, while default values and labels may be overridden.

Shared fields and permissions are validated per service, and shared capability-specific fields must be valid in every service. Authentication, model, and `endpointFields` cannot have `visibleForCapabilities`. Values of hidden fields are preserved, and hidden required fields do not block saving; validations resume when re-enabled. Users can disable all capabilities, in which case the instance cannot be called.

### 3.5 Network Permissions

```json
{
  "permissions": {
    "network": ["https://api.example.com", "http://localhost:8080"],
    "endpointFields": ["baseUrl"]
  }
}
```

- `network` must be full origins: scheme, host, optional port, without paths, trailing slashes, queries, credentials, or wildcards.
- Must use HTTPS, except `localhost`, `127.0.0.1`, and `[::1]` which may use HTTP. Plain LAN HTTP is unsupported.
- `endpointFields` references merged non-secret `text` fields, granting access to the origin of the instance's saved value without restricting paths.
- Requests may only access declared fixed origins and origins from configured endpoint fields; requests outside these scopes are blocked.
- When endpoint fields are modified, new requests use the new address while active tasks continue using their original snapshot. Never declare unrelated endpoint fields.
- Cookies, URL credentials, redirects, and access to other instance credentials are prohibited; no browser extension API permissions are granted.

### SDK Capability Boundaries and Stability

Differences among vendors, models, and protocols are handled by plugins and translated into standard SDK inputs and outputs. Adding services for existing capabilities should not require modifying host interfaces or introducing vendor-specific parameters into the host. Transcription uses real segments and optional word timestamps; OCR uses text, optional bounding polygons, and reading-order arrays; paragraphs can be returned directly as items. Coordinate scaling, vendor marker parsing, and request parameters are plugin adaptation responsibilities.

Prior to release, gaps in generic contracts or implementations can be resolved and validated via contract tests. Once released, existing input/output semantics remain stable; avoid altering host interfaces unless necessary. Generic bugs should be fixed in the host; when genuinely introducing new task capabilities, define their input/output, event, and resource boundaries first, extend the SDK, document version requirements, and never bypass validation using arbitrary private fields. Normal vendor adaptations within existing capabilities remain strictly within plugins.

### Plugin Kinds and Host Compatibility

Manifests may optionally declare `kind: "provider"` and `minHostVersion: "2.1.1"` (the version is illustrative; specify the first host version releasing the required feature). Omitting `kind` defaults to service provider plugins; omitting minHostVersion preserves legacy behavior without injecting default values or modifying package hashes. `minHostVersion` only accepts three non-negative safe integers without pre-release tags. Unknown kinds and unsupported host versions report `UNSUPPORTED_PLUGIN_KIND` and `HOST_VERSION_UNSUPPORTED` respectively.

Requirements synchronize with instance snapshots, enforced during import, restoration, instance creation, and execution boundaries. Newer hosts can prevent incompatible snapshots from executing; older hosts without these checks cannot be retroactively protected, requiring host updates across devices. Official catalogs may list incompatible packages but prevent their installation.

`kind` is a classification and grants no permissions. Currently only `provider` is supported; `script`/`declarative` are implementation methods for provider plugins. Future plugin types (e.g., page injects, text processors) will require independent contracts, permissions, and lifecycles, using new Manifest/API versions to prevent older hosts from loading them; never rely solely on unrecognized kinds or minHostVersion. No generic plugin registry is introduced at this time.

### 3.6 Model Catalog

When a service declares `chat`/`translate` and defines a non-secret `text` field named `model`, it can specify:

```json
{
  "modelField": "model",
  "models": [
    { "id": "model-a", "name": "General Model" },
    { "id": "model-b", "name": "Another General Model" }
  ]
}
```

IDs in the model catalog must be unique. Users may type custom IDs; the catalog is not an allowlist. All models and custom IDs share the same service capability declarations; authors and users must confirm custom models support the service capabilities and protocols. Model-level `capabilities` are rejected during installation; models with divergent capabilities must be split into independent services.

Default models prioritize field default values, then the first catalog item; if no catalog exists, users enter the ID manually. Changing models does not alter user-enabled capabilities, including the state where all are disabled. Updating catalogs only affects new instances; existing instances preserve their original catalog snapshot.

## 4. Declarative Protocol Rules (protocol)

In `protocol`, each handler only allows three fields: `protocol`, `task`, and `request`, without a `response` mapping. The host generates messages, selects complete or streaming requests, and converts protocol results into standard outputs.

### 4.1 Fields and Capability Constraints

| Field | Rule |
| ----- | ---- |
| `format` | Fixed string `"protocol"` |
| `handlers` | Handler mappings covering Manifest capability references |
| `protocol` | `openai-chat-completions` / `openai-audio-transcriptions` / `openai-audio-speech` |
| `task` | The 13 network tasks listed below matching capabilities and protocols; `speak` is built-in only |
| `request.baseUrl` | Required string or value node, including path prefixes like `/v1` |
| `request.model` | Required string or value node |
| `request.auth` | Required Bearer authentication with secret: `{"$secret": "declaredSecretKey"}` |
| `request.parameters` | Optional plain object for vendor-specific request body parameters |

`request` does not accept `url`, `method`, `headers`, `bodyType`, `responseType`, or `streamFormat`. `parameters` cannot override `baseUrl`, `auth`, `model`, `messages`, or `stream`, and cannot contain prototype properties or `$`-prefixed keys.

| Protocol | Task | Standard Support |
| -------- | ---- | ---------------- |
| `openai-chat-completions` | `chat` | complete / stream, text / image / audio input |
| `openai-chat-completions` | `translate` | complete / stream, batch support, text / JSON / LINE / XML |
| `openai-chat-completions` | `summarize`, `dictionary` | complete / stream |
| `openai-chat-completions` | `detectLanguage`, `suggest`, `segmentSubtitle`, `evaluate` | complete, structured output |
| `openai-chat-completions` | `recognizeText`, `parseImage`, `analyzeLayout` | image, complete; OCR can declare coordinates; layout returns regions |
| `openai-audio-transcriptions` | `transcribe` | audio, complete, can declare timestamps |
| `openai-audio-speech` | `synthesizeSpeech` | text, complete, returns task audio asset |

All 13 tasks can also be implemented using `script`; common SDKs handle generic protocols while scripts adapt vendor variations and return standard results defined in Section 6. `speak` is host system TTS, restricted to built-in implementations; external packages, instance restorations, and executions reject it. Declaring a capability does not guarantee model support; verify with real models. `coordinates` only applies to vision/layout, `timestamps` only applies to ASR, and `batch` only applies to translation.

Declarative rules only permit `stream` declarations on `chat`, `translate`, `summarize`, and `dictionary`; other tasks are rejected during installation and execution. `http` rules have no streaming path and reject any `stream` declaration. Scripts must implement both declared streaming events and complete results; never return complete responses while claiming incremental output has occurred.

Images support PNG, JPEG, WebP, and GIF. Standard Chat audio conversion supports WAV and MP3; M4A bytes are never disguised as WAV; other audio protocols are adapted via `script`. AssetRef MIME types and task ownership must match; single assets and HTTP bodies have an 8 MiB limit. Coordinate-less OCR returns Markdown and `poly: null` line items. When `coordinates: true` is declared, models must return genuine polygon boundaries; layout must return genuine pixel regions; the host verifies coordinates without synthesizing them.

Audio protocols reuse Section 8 HTTP Broker. ASR sends multipart `file`/`model`, selecting JSON or verbose_json according to `requireTimestamps` (or capability declaration if omitted), parsing genuine segments and words. TTS sends `input`/`model`/`voice`/`speed`, returning MP3 assets. TTS `voice`/`speed` prioritize task inputs, falling back to same-named instance configurations; `voice` is required. `parameters` only supplies vendor options and cannot override `file`, `input`, `audio`, `language`, `voice`, `speed`, `response_format`, `timestamp_granularities[]`, model, or auth fields. Non-standard protocols like OpenRouter Base64 ASR continue using `script`.

In the following example, `capabilities` are service fields, and `rules` is stored as `implementation.entry`; `apiVersion: 1`, `baseUrl`/`model`/`apiKey` settings, and network permissions must also be declared in the Manifest.

<!-- api1-example -->

```json
{
  "capabilities": {
    "summarize": {
      "handler": "summarize",
      "outputModes": ["complete", "stream"]
    },
    "transcribe": {
      "handler": "transcribe",
      "inputModalities": ["audio"],
      "timestamps": true,
      "outputModes": ["complete"]
    },
    "synthesizeSpeech": {
      "handler": "synthesizeSpeech",
      "outputModes": ["complete"]
    }
  },
  "rules": {
    "format": "protocol",
    "handlers": {
      "summarize": {
        "protocol": "openai-chat-completions",
        "task": "summarize",
        "request": {
          "baseUrl": { "$ref": "config.baseUrl" },
          "model": { "$ref": "config.model" },
          "auth": { "type": "bearer", "secret": { "$secret": "apiKey" } }
        }
      },
      "transcribe": {
        "protocol": "openai-audio-transcriptions",
        "task": "transcribe",
        "request": {
          "baseUrl": { "$ref": "config.baseUrl" },
          "model": { "$ref": "config.model" },
          "auth": { "type": "bearer", "secret": { "$secret": "apiKey" } }
        }
      },
      "synthesizeSpeech": {
        "protocol": "openai-audio-speech",
        "task": "synthesizeSpeech",
        "request": {
          "baseUrl": { "$ref": "config.baseUrl" },
          "model": { "$ref": "config.model" },
          "auth": { "type": "bearer", "secret": { "$secret": "apiKey" } }
        }
      }
    }
  }
}
```

Sharing a single configuration across these handlers is solely illustrative. Real ASR, TTS, and LLM services generally require different models and should be divided into separate service definitions rather than putting mismatched models into one service.

### 4.2 Value References and Conditionals

`parameters` example (fields declared in `settings` first):

```json
{
  "temperature": { "$ref": "config.translationTemperature" },
  "max_tokens": { "$ref": "config.maxTokens", "omitIfEmpty": true }
}
```

`$ref` preserves original data types and errors by default if the field is missing. `omitIfEmpty` omits the field when the value is `undefined`, `null`, or an empty string (whitespace-only strings are not omitted); `omitValues` omits fields matching exact strict values. Paths only support fixed property chains and array indices rooted at `config` or `input` (e.g. `input.messages[0].role`), and do not support `response`/`resources`, expressions, wildcards, or prototype properties.

Conditionals can reference declared non-secret boolean fields (`{"$if":{"$ref":"config.useCustomTemperature"},"then":0}`), or perform strict comparisons using `equals` against declared options of non-secret select configurations; input length evaluations and function calls are unsupported. Values for boolean conditions must be booleans without type coercion.

`$if` nodes only permit `$if`, `then`, and `else`, requiring at least one branch. Unmatched branches omit the object field or array item, with a maximum nesting depth of 32.

Services providing a thinking toggle should use `thinkingMode` (`select` with options `auto`, `enabled`, `disabled`) and optional `thinkingEffort` (`select` declaring supported efforts, with `_default` representing interface default). The service configuration UI renders these fields as unified dropdowns, displaying effort only when thinking is enabled. The recommended default is `disabled`, and actual request parameters are determined by the plugin implementation: `auto` should omit thinking parameters, and `_default` should omit effort parameters. Example:

```json
{
  "thinking": {
    "$if": { "$ref": "config.thinkingMode", "equals": "auto" },
    "else": { "type": { "$ref": "config.thinkingMode" } }
  },
  "reasoning_effort": {
    "$if": { "$ref": "config.thinkingMode", "equals": "enabled" },
    "then": { "$ref": "config.thinkingEffort", "omitValues": ["_default"] }
  }
}
```

The `thinking` / `reasoning_effort` request body shown above is merely a protocol example, not a parameter supported by all Chat Completions providers. Verify against vendor and specific model docs; third-party endpoints should not copy vendor thinking parameters directly, and initial versions can omit thinking configs and use vendor defaults.

`equals` only accepts option values declared in the referenced field, performs strict equality without coercion, and cannot reference secret fields. Manifest settings must declare modes, efforts, and defaults; services without thinking support need not declare them. Existing instances are updated manually by users and not migrated automatically.

General nodes in `protocol` support `$ref` (including field fallbacks, omission options, and `languages.toIso6391` transforms) and `$if`, but not `$url` or `$asset`; `$secret` is only valid in the designated `auth.secret` position.

### 4.3 Complete Vision Service

Add to Section 2 `services`:

```json
{
  "id": "vision",
  "name": "Full Image Recognition",
  "implementation": { "kind": "declarative", "entry": "services/vision.json" },
  "capabilities": {
    "parseImage": {
      "handler": "parseImage",
      "inputModalities": ["image"],
      "taskModes": ["doc"],
      "coordinates": false,
      "outputModes": ["complete"]
    }
  },
  "settings": [
    { "key": "model", "label": "Vision Model ID", "type": "text", "required": true }
  ]
}
```

Add `services/vision.json`:

```json
{
  "format": "protocol",
  "handlers": {
    "parseImage": {
      "protocol": "openai-chat-completions",
      "task": "parseImage",
      "request": {
        "baseUrl": { "$ref": "config.baseUrl" },
        "model": { "$ref": "config.model" },
        "auth": { "type": "bearer", "secret": { "$secret": "apiKey" } }
      }
    }
  }
}
```

Default prompts request faithful extraction of visible text; an explicitly provided `input.prompt` takes precedence. `taskModes` only declares verified modes; `protocol` does not generate table- or formula-specific prompts automatically based on `input.mode`, requiring scenarios to pass suitable prompts. In Plugin API 1, declaring `coordinates: true` adopts the structured OCR contract; vendor-specific response structures still require `script`.

## 5. Declarative Request Mapping Rules (http)

`http` is suited for a single fixed request and result mapping without generating messages or streaming events, and should declare `complete`. Complex branching, per-item transformations, signing, and polling require `script`.

### 5.1 Complete Transcription Service

Reusing Section 2 shared `baseUrl`/`apiKey`, add to `services`:

```json
{
  "id": "transcription",
  "name": "Speech Recognition",
  "implementation": {
    "kind": "declarative",
    "entry": "services/transcription.json"
  },
  "capabilities": {
    "transcribe": {
      "handler": "transcribe",
      "timestamps": false,
      "outputModes": ["complete"]
    }
  },
  "settings": [
    {
      "key": "model",
      "label": "ASR Model ID",
      "type": "text",
      "required": true
    }
  ]
}
```

Add `services/transcription.json`:

```json
{
  "format": "http",
  "handlers": {
    "transcribe": {
      "request": {
        "url": {
          "$url": { "base": "config.baseUrl", "path": "audio/transcriptions" }
        },
        "method": "POST",
        "auth": { "type": "bearer", "secret": { "$secret": "apiKey" } },
        "bodyType": "multipart",
        "body": {
          "file": { "$asset": "input.audio" },
          "model": { "$ref": "config.model" },
          "response_format": "json",
          "language": {
            "$ref": "input.language",
            "omitIfEmpty": true,
            "omitValues": ["auto"],
            "transform": "languages.toIso6391"
          }
        },
        "responseType": "text"
      },
      "response": {
        "kind": "json",
        "errorPath": "error.message",
        "map": { "text": { "$ref": "response.text" } }
      }
    }
  }
}
```

The `response_format` and `language` parameters above only apply to endpoints declaring support for them. Adjust according to vendor documentation and live testing; do not send extra parameters to services that only accept `file` and `model`. If the service depends on file extensions or requires synthesizing missing filenames, use `script` (see Section 8.3).

### 5.2 Nodes and Mappings

| Node | Function |
| ---- | -------- |
| `{"$ref": "config.model"}` | Type-preserving value retrieval; errors if missing |
| `$ref` + `omitIfEmpty`/`omitValues` | Field omission in objects; evaluated prior to transform |
| `$ref` + `transform: "languages.toIso6391"` | Only allowed transform allowlist; errors on unknown language |
| `{"$url": {"base": "config.baseUrl", "path": "audio/speech"}}` | Directory-style join preserving `/v1`; path has no leading `/`, `:`, or `..` |
| `{"$secret": "apiKey"}` | Secret reference placed in `auth.secret` or `secretBindings.secret`, not plaintext |
| `{"$asset": "input.audio"}` | Task asset reference |

Request roots are `config`, `input`, `resources`; response mappings root at `response`. Paths support fixed properties and numeric indices (e.g. `response.choices[0].message.content`), without expressions, filters, recursive queries, or arbitrary JS.

Plain strings undergo no interpolation; `"{{config.model}}"` is treated as a literal. Maximum nesting depth is 32. Omission options in `http` apply to object fields, cannot filter arrays, and do not accept `$if`.

When `response.kind = "json"`, the body is parsed first, checking business errors against `errorPath` relative to the response root, then generating standard results via `map`. Missing fields do not convert into empty successes. `kind = "asset"` converts a `responseType = "asset"` reference into `{audio, mimeType}`, suitable for `synthesizeSpeech`.

### 5.3 Complete Speech Synthesis Service

Add to `services`:

```json
{
  "id": "speech",
  "name": "Speech Synthesis",
  "implementation": { "kind": "declarative", "entry": "services/speech.json" },
  "capabilities": {
    "synthesizeSpeech": {
      "handler": "synthesizeSpeech",
      "outputModes": ["complete"]
    }
  },
  "settings": [
    {
      "key": "model",
      "label": "TTS Model ID",
      "type": "text",
      "required": true
    },
    { "key": "voice", "label": "Voice ID", "type": "text", "required": true }
  ]
}
```

Add `services/speech.json`:

```json
{
  "format": "http",
  "handlers": {
    "synthesizeSpeech": {
      "request": {
        "url": { "$url": { "base": "config.baseUrl", "path": "audio/speech" } },
        "method": "POST",
        "auth": { "type": "bearer", "secret": { "$secret": "apiKey" } },
        "bodyType": "json",
        "body": {
          "model": { "$ref": "config.model" },
          "voice": { "$ref": "input.voice", "fallbackRef": "config.voice" },
          "input": { "$ref": "input.text" },
          "speed": { "$ref": "input.speed", "omitIfEmpty": true },
          "response_format": "mp3"
        },
        "responseType": "asset"
      },
      "response": { "kind": "asset" }
    }
  }
}
```

This rule prioritizes `input.voice` from the call, falling back to instance-configured `voice` when omitted.

### Field Default Fallbacks

Value nodes in both formats support `{"$ref": "input.voice", "fallbackRef": "config.voice"}`. The primary value only falls back when `undefined` or `null`; empty strings, `0`, and `false` are retained. The value is selected first, then `omitIfEmpty` / `omitValues` are applied, and finally `transform` is executed; if the final value is `undefined` and not omitted, an error is raised. A final `null` preserves standard null semantics.

Both paths for fallbacks are limited to fixed `input`/`config` properties and numeric array indices; expressions, prototype properties, secret reads, fallback objects, or fallback chains are rejected. Secrets are accessed solely via `$secret`. Response mappings and `$if` conditions do not support `fallbackRef`; unknown fields or legacy version flags are rejected during loading and execution.


## 6. Input and Output for 14 Capabilities

The following TypeScript notation is for documentation only; actual inputs and outputs are serializable objects: `?` denotes optional, `A[]` denotes arrays, and `Record<string, A>` denotes string-keyed dictionaries. Vendor raw responses must be converted into standard results.

### 6.1 Common Types

```ts
type AssetRef = { assetId: string; mimeType: string; filename?: string };
type TextItem = { id: string; text: string };
type ImageSize = { width: number; height: number };
type OcrBlock = { text: string; poly: number[][] | null; confidence?: number };
type OcrResult = {
  text: string;
  format: "text" | "markdown";
  items?: OcrBlock[];
};
```

`AssetRef` is generated by the host and cannot be fabricated or reused across tasks. Text `items` input must be non-empty; `id` must be a non-empty, unique string and should never be converted into a number.

`poly` represents input image pixel coordinates, e.g. `[[10, 20], [110, 20], [110, 50], [10, 50]]`, containing at least 3 points, each consisting of two finite numbers, enclosing a non-zero area. Coordinates must be scaled back to original image dimensions; normalized or PDF coordinates are forbidden. `imageSize` width and height must be positive finite numbers; `confidence`/probabilities must be in `[0, 1]`; time units are in seconds, with `0 <= start <= end`.

Optional `segments[].words` in transcription must use actual word timestamps and completely cover the corresponding segment's text (ignoring whitespace). Authentic zero-duration words are allowed with `start === end`; never delete text or fabricate timestamps just to satisfy positive durations. When optional word alignment is invalid, preserve complete segments; an OCR item can be a single line or natural paragraph, with the `items` array sorted in reading order, using `poly: null` when coordinates are absent. These conventions are vendor-agnostic.

### 6.2 translate

```ts
type Input = {
  items: TextItem[];
  translationMode?: "single" | "batch";
  outputProtocol?: "text" | "json" | "line" | "xml";
  targetLanguage: string;
  sourceLanguage?: string;
  textFormat?: "text" | "html";
  systemPrompt?: string;
  userPrompt?: string;
  glossary?: Record<string, string>;
  context?: string;
  tone?: string;
  document?: {
    title?: string;
    description?: string;
    summary?: string;
    url?: string;
  };
};
type Result = { items: TextItem[]; sourceLanguage?: string };
```

Non-aggregated translation uses `single`/`text`, receiving one item per call; aggregated translation uses `batch`/`json`, `line`, or `xml`, maintaining the aggregated protocol even if only one item is passed in a given call. The mode is determined by configuration and active prompts, not inferred from item count. Direct SDK calls without these fields default to JSON.

The result must cover all input IDs without omissions, duplicates, or additions. Returning in input order is recommended; the SDK parser re-sorts by ID and rejects empty translations. HTML inputs require handling structure according to scenario needs without dropping tags arbitrarily.

Input: `{"items": [{"id": "a", "text": "Hello"}, {"id": "b", "text": "World"}], "targetLanguage": "zh-CN"}`  
Output: `{"items": [{"id": "a", "text": "你好"}, {"id": "b", "text": "世界"}]}`

The host manages aggregation, scheduling, and cancellation; the handler is responsible for all `items` received in the call. Disabling instance aggregation is not a justification to ignore explicit multi-item inputs; declare `batch.supported = false` when batching is unsupported.

### 6.3 chat

```ts
type Content =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image" | "audio"; asset: AssetRef }
    >;
type Input = {
  messages: Array<{ role: "system" | "user" | "assistant"; content: Content }>;
};
type Result = {
  text: string;
  reasoning: string;
  usage?: Record<string, number>;
  finishReason?: string;
};
```

`messages` must be non-empty; return an empty string for `reasoning` if reasoning content is absent. Multimodal chat requires declaring `inputModalities`; the host's `image`/`asset` structure is not the vendor's `image_url`; scripts can call `prepareMessages(messages, ctx.assets.read)` to convert standard image and audio components; declarative rules perform this transformation automatically. There is currently no tool-calling message contract.

### 6.4 summarize, detectLanguage, dictionary, suggest

| Capability | Input | Result |
| ---------- | ----- | ------ |
| `summarize` | `{text, language?, instructions?, userPrompt?, context?}` | `{text}` |
| `detectLanguage` | `{text, candidates?: string[]}` | `{language: string, confidence?: number}` |
| `dictionary` | `{text, sourceLanguage?, language?, context?, instructions?, userPrompt?}` | `{text, format: "text" \| "markdown"}` |
| `suggest` | `{text, language?}` | `{items: string[]}` |

`text` must be non-empty, with optional language, prompt, and context strings. `dictionary` and `summarize` may receive `document: {title, description, summary, url}`; `detectLanguage.candidates` must be a non-empty array of language code strings, and the returned language must belong to candidates. `dictionary` currently returns text or Markdown without requiring structured entry objects. Detection returns language codes.

### 6.5 segmentSubtitle

```ts
type Input = {
  items: Array<{
    id: string;
    text: string;
    start: number;
    end: number;
    pauseMs?: number;
  }>;
  sourceLanguage?: string;
  targetLanguage?: string;
  instructions?: string;
  context?: string;
};
type Result = {
  groups: Array<{ ids: string[]; text: string; translation?: string }>;
};
```

Input additionally supports `document: {title, description, summary, url}`, `tone: string`, and `glossary: Record<string, string>`. `pauseMs` indicates non-negative pause milliseconds; real subtitle scenarios compute this from adjacent event timestamps. Summary and surrounding context are passed separately without replacing one another.

`groups` and each group's `ids` must be non-empty; the concatenation of all group IDs must strictly match input order, covering each item exactly once. Input `[a, b, c]` can be grouped into `[a, b]` and `[c]`, but cannot be reordered or omitted; results do not need to repeat timestamps.

### 6.6 transcribe

```ts
type Input = {
  audio: AssetRef;
  language?: string;
  requireTimestamps?: boolean;
};
type Result = {
  text: string;
  segments?: Array<{ start: number; end: number; text: string }>;
};
```

Remote ASR for YouTube uploads `audio/mp4` (`.m4a`), directly slicing and packaging raw AAC frames from the cache without re-encoding. The backend must support M4A; incompatible formats report errors without automatically switching to WAV. Local ASR uses 16 kHz mono WAV. The audio cache stores original compressed segments, packaging M4A on demand for segment or sentence downloads; lists show cache sizes, and exported sizes/boundaries may vary slightly due to container packaging and complete AAC frames.

Video ASR calls pass `requireTimestamps = false`, determining synchronization by the actual response: when valid `segments` exist, model timestamps are used; when segments are missing or empty, the entire text is mapped across the audio block (bounded by timestamp capability and service settings). Declarations do not dictate video synchronization modes; passing `false` explicitly does not enforce declared timestamps, but returned timestamps must always be valid. Other calls passing `true` must return timestamps; if omitted, the service declaration applies. Milliseconds returned by vendors must be converted to seconds; never fabricate word-level timestamps from full text. When `language` is missing or `auto`, vendor language parameters are typically omitted.

### 6.7 recognizeText and parseImage

```ts
type Input = {
  image: AssetRef;
  mode?: "doc" | "table" | "formula";
  prompt?: string;
  imageSize?: ImageSize;
};
type Result = OcrResult;
```

`recognizeText` is OCR; `parseImage` is visual parsing; `taskModes` restricts modes. Both can provide coordinates, irrespective of capability names.

Coordinate-less calls explicitly return `poly: null` or omit `items`. When `coordinates: true`, there must be at least one non-empty text item with a valid `poly`. Never use whole-image rectangles to fabricate text positions. Full text cannot fabricate inpainting regions; PDFs without coordinates only relate to original page areas.

### 6.8 analyzeLayout

```ts
type Input = { image: AssetRef; imageSize?: ImageSize };
type Result = {
  regions: Array<{ type: string; poly: number[][]; order: number }>;
};
```

`type` is the region classification string; `order` is a non-negative reading order integer; pixel coordinates are scaled to PDF dimensions by the host based on actual dimensions.

### 6.9 evaluate

```ts
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Question =
  | {
      type: "choice";
      instructions: Json;
      criteria: Record<string, Json>;
    }
  | { type: "score"; instructions: Json; criteria: Json[] }
  | {
      type: "noul";
      instructions: Json;
      criteria?: { false?: Json; true?: Json } | null;
    };
type Input = {
  state: string | Json[] | Record<string, Json>;
  questions: Record<string, Question>;
};
type Action = { act_probability: number };
type Answer =
  | {
      type: "choice";
      confidence?: number;
      action?: Action;
      choice: string;
      probabilities: Record<string, number>;
    }
  | {
      type: "score";
      confidence?: number;
      action?: Action;
      score: number;
      legend: Record<string, Json>;
      probabilities: Record<string, number>;
    }
  | { type: "noul"; confidence?: number; action?: Action; noul: number };
type Result = {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens?: number; output_tokens?: number; cost?: number };
  timing?: {
    tokenizeMs?: number;
    onnxMs?: number;
    postprocessMs?: number;
    totalMs?: number;
  };
};
```

This is the typed decision contract for plugin `evaluate`, not standard chat JSON. Choice `criteria` must be a non-empty object with non-blank keys; the returned `choice` must belong to the criteria object's own keys. `questions` must be non-empty, with one answer of matching `type` per ID; probabilities and confidence must be in `[0, 1]`, and `score` must be a finite number. Internal protocols for the local Jev engine are maintained separately.

### 6.10 synthesizeSpeech and speak

`speak` is an internal system TTS capability; external plugins cannot declare or execute it. Network plugins use `synthesizeSpeech` to return audio, which the host scenario plays.

```ts
type Input = {
  text: string;
  language?: string;
  speed?: number;
  voice?: string;
};
type SynthesizeResult = { audio: AssetRef; mimeType: string };
type SpeakResult = { status: "ended" | "interrupted" };
```

`text` must be non-empty, and `speed` must be positive and finite. Synthesis returns a real asset where both `mimeType` values match; `speak` signifies playback completion. External SDKs have no local playback; network TTS generally implements `synthesizeSpeech` and cannot claim `ended` merely upon generating audio.

## 7. JavaScript and ctx SDK

### 7.1 Complete Text Implementation

Change Section 2 `implementation` to `{"kind": "script", "entry": "services/text.js"}`, set both `outputModes` to `["complete"]`, and use the complete script:

```js
async function complete(messages, config, ctx) {
  var request = ctx.helpers.openai.chatCompletions.buildRequest({
    baseUrl: config.baseUrl,
    model: config.model,
    messages: messages,
    stream: false,
    auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
  });
  return ctx.helpers.openai.chatCompletions.parseResponse(
    await ctx.http.request(request),
  );
}

exports.chat = async function (input, config, ctx) {
  return complete(input.messages, config, ctx);
};

exports.translate = async function (input, config, ctx) {
  var result = await complete(
    ctx.helpers.translation.buildMessages(input),
    config,
    ctx,
  );
  return ctx.helpers.translation.parseResult(result.text, input);
};
```

Entry points use `exports`; do not use `import`, `require`, or `export default`. Handlers must match case. `config` and `ctx.config` only contain non-secret fields; `config.apiKey` is unavailable.

### 7.2 ctx Members and Environment

Each execution runs in an isolated Sval Worker in script mode, supporting plain objects, arrays, functions, async/await, and `for await`. Do not assume browser or Node.js globals.

| Member | Usage |
| ------ | ----- |
| `ctx.requestId` | Call ID for diagnostics; do not forge caller identities |
| `ctx.config` | Non-secret configuration; identical to second parameter |
| `ctx.options.streaming` | Boolean flag for this invocation; not an `"auto"` string |
| `ctx.resources` | Map of resource ID → task `AssetRef` |
| `ctx.assets.read(ref)` | `Promise<ArrayBuffer>` reading current task bytes |
| `ctx.secrets.ref(key)` | Synchronous opaque secret reference |
| `ctx.secrets.sign(ref, options)` | `Promise<string>` signed by host broker |
| `ctx.http.request(descriptor)` | `Promise<{status, headers, body}>` |
| `ctx.http.stream(descriptor)` | `AsyncIterable` yielding framed SSE/NDJSON events |
| `ctx.emit(event)` | `Promise<void>`, must be awaited sequentially |
| `ctx.helpers` | Public utilities in Section 9; does not make network calls |

The script `ctx` does not expose `AbortSignal`, asset writes, persistent storage, or arbitrary RPC. Treat arguments as read-only; clone objects if mutations are needed. Never use module-level variables for storage across calls.

Forbidden APIs: DOM (`window`, `document`), extension APIs (`chrome`, `browser`, `GM`), network APIs (`fetch`, `XMLHttpRequest`, `WebSocket`), spawning Workers, host storage, `eval`/`Function`, dynamic `import`, infinite loops, and nested interpreters. The SDK is the sole host entry point; authoring constraints do not substitute for security isolation.

### 7.3 Errors and Cancellation

Throw an `Error` to signal failure, optionally attaching a non-secret `code`:

```js
throw Object.assign(new Error("Response missing translation"), { code: "INVALID_RESPONSE" });
```

Network calls, asset reads, and event emissions via SDK are subject to cancellation. Canceling, timing out, or disabling/deleting services aborts requests and terminates the Worker. Asynchronous calls must be awaited; never catch cancellations or parsing errors and return empty successes. Error messages must not contain secrets, authorization headers, queries with keys, or complete asset contents.

Extension bridge timeout is 60 seconds by default, up to 300 seconds, controlled by the host. Approximately 1 second of synchronous computation without heartbeats triggers a watchdog; asynchronous network waits do not count as synchronous computation, avoiding CPU-intensive execution.

### 7.4 Script Synthesis

Convert Section 5.3 speech service to `script`, entry `services/speech.js`:

```js
exports.synthesizeSpeech = async function (input, config, ctx) {
  var request = ctx.helpers.openai.audio.buildSpeechRequest({
    baseUrl: config.baseUrl,
    model: config.model,
    text: input.text,
    voice: input.voice ?? config.voice,
    speed: input.speed,
    auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
  });
  var response = await ctx.http.request(request);
  return { audio: response.body, mimeType: response.body.mimeType };
};
```

`language` is language code, while `voice` is voice ID; do not confuse them. When vendors require explicit language parameters, supply them according to their protocol.

### 7.5 Integrating Non-Chat Completions Translation APIs

If a service has its own protocol, construct requests and convert results directly without using OpenAI helpers. Suppose the target protocol is: POST `{text, target, source?}` to `/translate` under the base URL with Bearer authentication, returning `{"translation": "translated text"}` on success. This is an illustrative protocol; adjust paths and fields according to vendor documentation.

Using Section 2 shared `baseUrl`/`apiKey`, set the `services` array to contain only the following service object (`"services": [{...}]`); this interface does not need a `model` field, nor does it use a model to generate prompts:

```json
{
  "id": "translation",
  "name": "Custom Protocol Translation",
  "implementation": { "kind": "script", "entry": "services/translation.js" },
  "capabilities": {
    "translate": {
      "handler": "translate",
      "batch": { "supported": false },
      "outputModes": ["complete"]
    }
  }
}
```

Add `services/translation.js`:

```js
exports.translate = async function (input, config, ctx) {
  var item = input.items[0];
  var body = { text: item.text, target: input.targetLanguage };
  if (input.sourceLanguage && input.sourceLanguage !== "auto") {
    body.source = input.sourceLanguage;
  }
  var response = await ctx.http.request({
    url: config.baseUrl.replace(/\/+$/, "") + "/translate",
    method: "POST",
    auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
    bodyType: "json",
    body: body,
    responseType: "text",
  });
  var data = JSON.parse(response.body);
  if (typeof data.translation !== "string" || !data.translation.trim()) {
    throw new Error("Response missing non-empty translation field");
  }
  return { items: [{ id: item.id, text: data.translation }] };
};
```

Because `batch.supported = false`, the host rejects multi-item calls, so this example only processes one item while preserving its original ID. Do not declare `supported = true` while only picking the first item. If source/target languages require different codes, map them first; if glossary, context, or HTML are supported by the service, pass them in requests; otherwise, do not claim vendor support for these features.

## 8. HTTP, Credentials, and Assets

Request descriptors apply to `script`/v1; `protocol` uses Section 4 structures.

### 8.1 Request Reference

```ts
type Request = {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  auth?: { type: "bearer"; secret: SecretRef };
  secretBindings?: Array<{
    target: "header" | "query" | "json";
    name: string;
    secret: SecretRef;
    prefix?: string;
  }>;
  bodyType?: "json" | "multipart" | "asset";
  body?: unknown;
  responseType?: "text" | "asset";
  streamFormat?: "sse" | "ndjson";
};
```

`SecretRef` can only be obtained via `ctx.secrets.ref`; do not construct it, inspect internal properties, or reuse it across tasks.

- `method` defaults to GET, capitalized and restricted to methods in the table.
- `json` body receives native JSON; the host serializes it and sets Content-Type by default; do not stringify manually.
- `multipart` body receives field objects; `AssetRef` converts to file uploads, and other values convert to strings. Do not pass FormData/Blob or write boundaries manually; the host sets Content-Type.
- `asset` body is an existing `AssetRef`; sends raw bytes and sets Content-Type according to protocol.
- Plain text bodies omit `bodyType`, pass strings in `body`, and set Content-Type.
- `responseType = "text"` (default) yields UTF-8 body strings, parsed manually or via helpers.
- `asset` body creates a new `AssetRef`, taking MIME from response Content-Type (defaults to `application/octet-stream`).

`headers` in successful responses is a plain object. Non-2xx responses throw `HTTP_ERROR` without exposing error bodies, headers, or full URLs; business errors within HTTP 200 must be parsed by plugins. Network scheduling does not retry automatically; concurrency slots are released only after the streaming body is consumed.

### 8.2 Injections and Signatures

Non-Bearer credentials use `request.secretBindings`:

```js
var binding = {
  target: "header",
  name: "X-API-Key",
  secret: ctx.secrets.ref("apiKey"),
  prefix: "",
};
```

`name` only permits alphanumeric characters, underscores, dots, or hyphens, excluding prototype property names. `json` writes strictly to top-level fields of JSON bodies without nested paths; `query` writes to URL query strings. Injecting cookies is forbidden. Bearer replaces existing `Authorization` headers; all injections occur after origin verification. The SDK provides no plaintext reads; do not persist secrets into non-secret fields.

Signatures:

```js
var signature = await ctx.secrets.sign(ctx.secrets.ref("apiKey"), {
  data: "string_to_sign",
  algorithm: "hmac-sha256",
  encoding: "hex",
});
```

Currently only HMAC-SHA256 is supported; `encoding` is `hex` (default) or `base64`. String-to-sign formatting, field ordering, timestamps, and signature headers are determined by vendor protocols; regular SHA-256 digests cannot substitute for HMAC.

### 8.3 Images and Audio

Input `AssetRef` is not a local filesystem path; uploads directly pass `multipart`/`asset` without calling `read`. Complete vision script (replacing Section 4.3 service with `script` and entry `services/vision.js`):

```js
exports.parseImage = async function (input, config, ctx) {
  var bytes = await ctx.assets.read(input.image);
  var request = ctx.helpers.openai.chatCompletions.buildRequest({
    baseUrl: config.baseUrl,
    model: config.model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              input.prompt ??
              "Extract visible text faithfully. Output only the text.",
          },
          {
            type: "image_url",
            image_url: {
              url:
                "data:" +
                input.image.mimeType +
                ";base64," +
                ctx.helpers.encoding.bytesToBase64(bytes),
            },
          },
        ],
      },
    ],
    stream: false,
    auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
  });
  var result = ctx.helpers.openai.chatCompletions.parseResponse(
    await ctx.http.request(request),
  );
  return { text: result.text, format: "text" };
};
```

Full-image recognition does not declare `coordinates`. OCR services implement `recognizeText` per vendor protocol and convert actual bounding boxes; changing capability labels alone cannot substantiate coordinate support. The SDK lacks `assets.put`; audio is retrieved via `responseType = "asset"` and returned as references, never as Blobs, ArrayBuffers, filesystem paths, or full base64 strings. Asset IDs are valid only within the current task.

Multipart uploads use `AssetRef.filename`; if missing, the host defaults to extension-less `input`. Some ASR services infer audio formats from this; scripts can preserve valid filenames, or synthesize a new reference with an extension based on known MIME types when missing (retaining original `assetId` / `mimeType`), passing it to the host. Do not alter extensions to disguise formats, and do not treat renaming as transcoding. See [SiliconFlow transcription implementation](../plugins/siliconflow/services/transcribe.js).

When declaring support for an audio format, document the container, codec, MIME, and tested models. WAV and M4A AAC-LC must be tested separately; successful `.m4a` tests do not imply all M4A codecs work; `timestamps: true` must genuinely return valid segment timestamps.

OCR prompts and image/text ordering can differ across models. Generic full-text prompts cannot replace model verification; when retaining vendor Markdown, return text per contract without fabricating coordinates. Document page recognition follows the host page-by-page rasterization flow and does not imply model support for native PDF uploads. See [SiliconFlow README and Acceptance Record](../plugins/siliconflow/README.en.md).

### 8.4 Execution Resources and Budgets

Manifest small dictionary resource:

```json
{
  "resources": [
    {
      "id": "dictionary",
      "path": "resources/dictionary.json",
      "mimeType": "application/json"
    }
  ]
}
```

Resources must physically exist, have unique IDs matching `^[A-Za-z_$][\w$]*$`, be cloned into instances, and not execute JS. Read via:

```js
var bytes = await ctx.assets.read(ctx.resources.dictionary);
var dictionary = JSON.parse(ctx.helpers.encoding.decodeUtf8(bytes));
```

| Object | Current Limit |
| ------ | ------------- |
| ZIP Archive Size | 5 MiB |
| ZIP Uncompressed / Folder Size | 10 MiB, 100 ZIP entries / 100 folder files |
| Execution Resources | 8 files, 256 KiB each, 1 MiB total |
| Icon Size | 256 KiB |
| Task Assets (inputs, resources, responses) | 8 assets, 8 MiB total |
| Request / Response / Single Stream Body | 8 MiB each |
| Input / Result / SDK Message JSON | 8 MiB each |
| Cumulative Events JSON | 8 MiB |
| String to Sign (UTF-8) | 1 MiB |
| Pending Operations in Script | 64, with `request` + `asset.read` combined max 4 |
| Concurrent HTTP Streams in Script | 4 |

Base64 and JSON encodings increase byte sizes. Never place large models, media files, or databases into execution resources, configurations, or text results.

## 9. Public Helpers

All helpers reside on `ctx.helpers` and are synchronous unless noted as async. They solely construct or parse data without inferring capabilities or initiating network requests. Do not rely on unlisted host internal functions as public SDK APIs.

### 9.1 Chat Completions

| Call | Return / Convention |
| ---- | ------------------- |
| `openai.chatCompletions.buildBody({model, messages, stream?, ...parameters})` | Request JSON; `stream` defaults to `false` |
| `openai.chatCompletions.buildRequest({baseUrl, model, messages, stream?, auth?, ...parameters})` | POST descriptor appending `/chat/completions` |
| `openai.chatCompletions.parseResponse(response)` | `{text, reasoning, usage?, finishReason?}`; `reasoning` defaults to empty string |
| `openai.chatCompletions.createStreamParser()` | `{push(frame), finish()}`; `push` returns standard event array |

`baseUrl` should include protocol prefixes without credentials, queries, or fragments. Vendor support for extra parameters must be verified by the author. Parsers handle errors, refusals, missing bodies, and incomplete termination reasons such as `length`, `content_filter`, or tool calls. Supports compatible extension `reasoning_content`; currently no Responses API helper exists, and the two event models cannot be mixed.

### 9.2 Translation Encoding

| Call | Return / Convention |
| ---- | ------------------- |
| `translation.buildMessages(input)` | System/user messages expanding Section 11 variables |
| `translation.parseResult(text, input)` | Standard `{items}`, supporting text/JSON/LINE/XML, verifying all IDs and non-empty translations |
| `translation.createStreamParser(input)` | **Async** returning `{push, finish}`; `push` returns sync `item.delta`/`item.complete` arrays |
| `translation.encodeSegments(items, format?)` | Encodes as `json` (default), `xml`, or `line` |
| `translation.parseSegments(text, {items, format?})` | ID-verified `{items}` |
| `translation.createXmlStreamParser({items})` | Sync `{push, finish}`; completed `<t>` tags yield `item.complete` |

JSON: `[{"id":"a","text":"Hello"}]`; XML: `<root><t id="a">Hello</t></root>`; LINE: `a | Hello`. XML supports this schema only, without DTD or external entities. LINE IDs cannot contain vertical bars or newlines; internal newlines encode as `<br>`.

Parsers verify missing, duplicate, or unknown IDs and blank translations, returning in input order. The stream parser receives translation text deltas emitted by the model, not raw SSE objects or Chat Completions frames.

### 9.3 Audio

| Call | Convention |
| ---- | ---------- |
| `openai.audio.buildTranscriptionRequest({baseUrl, model, audio, language?, requireTimestamps?, auth?})` | `/audio/transcriptions` multipart; defaults to `json`; uses `verbose_json` + segment timestamps when `requireTimestamps = true`; omits when `auto` |
| `openai.audio.parseTranscription(response)` | `{text, segments?}`, verifying timestamps and text |
| `openai.audio.buildSpeechRequest({baseUrl, model, text, voice, speed?, auth?})` | `/audio/speech` JSON, MP3, `responseType = "asset"` |

Default transcription requests do not guarantee segment returns; when timestamps are needed, adjust requests per vendor protocol, verify, and then declare `timestamps`. Helpers do not play audio.

### 9.4 Encoding, Languages, and Framing

| Call / Property | Convention |
| --------------- | ---------- |
| `encoding.utf8ToBase64(text)` / `base64ToUtf8(text)` | Unicode encoding/decoding; throws on invalid UTF-8 |
| `encoding.bytesToBase64(buffer)` / `decodeUtf8(buffer)` | `ArrayBuffer` to base64 / strict UTF-8 |
| `crypto.digest(text, encoding?)` | Async SHA-256; `hex` (default) or `base64` |
| `languages.codes` | Read-only built-in mapping |
| `languages.toIso6391(language)` | Known mapping; throws on unknown; omit `auto` first |
| `speech.normalizeLocale(language)` | BCP-47 locale; cannot be used as voice ID |
| `speech.voices.openai["tts-1"]` | `{label, value}` array: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer` |
| `stream.createSSEParser()` | `push(text)` → `{event, data}` array; `finish` checks trailing frame |
| `stream.createNDJSONParser()` | `push`/`finish` → JSON array; `finish` handles un-terminated trailing record |

The voice table is static SDK data and does not represent all current vendor voices or account access. Plugins can define custom options, while system voices are enumerated by the host. `ctx.http.stream` already handles decoding and framing, typically removing the need to invoke low-level parsers. Distinguish between levels: "Network chunks → Frames → Protocol deltas → Standard events".


## 10. Streaming Output and Batch Translation

### 10.1 Selection and Events

Declarative `protocol` handles streaming automatically for `chat`, `translate`, `summarize`, and `dictionary`; `script` must implement it manually. Streaming is enabled by default when supported by capabilities and models, and explicitly disabled when `useStream = false` in instances; `ctx.options.streaming` is the actual boolean choice for the invocation. Scenarios that only await the final result may still utilize streaming under the hood.

| Event | Structure |
| ----- | --------- |
| `text.delta` | `{type: "text.delta", text: "chunk"}` |
| `reasoning.delta` | `{type: "reasoning.delta", text: "chunk"}` |
| `item.delta` | `{type: "item.delta", id: "a", text: "chunk"}`, `translate` only |
| `item.complete` | `{type: "item.complete", id: "a", text: "full translation"}`, `translate` only |
| `progress` | `{type: "progress", progress: 0.5, message: "processing"}`, last two items optional |

`item` IDs must originate from the current call's input; `progress` is in `[0, 1]`. Events do not replace the final return value; each event must be awaited individually via `await ctx.emit(event)` without un-awaited promises or unbounded `Promise.all`. When no subscribers exist, tasks continue executing and retain final results without persisting full event histories.

### 10.2 Complete Streaming Script

Replace `services/text.js` from Section 7.1 entirely, setting both `outputModes` to `["complete", "stream"]`:

```js
async function complete(messages, config, ctx, translationInput) {
  var streaming = Boolean(ctx.options.streaming);
  var request = ctx.helpers.openai.chatCompletions.buildRequest({
    baseUrl: config.baseUrl,
    model: config.model,
    messages: messages,
    stream: streaming,
    auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
  });
  if (!streaming) {
    return ctx.helpers.openai.chatCompletions.parseResponse(
      await ctx.http.request(request),
    );
  }
  var chatParser = ctx.helpers.openai.chatCompletions.createStreamParser();
  var translationParser = translationInput
    ? await ctx.helpers.translation.createStreamParser(translationInput)
    : null;
  for await (var frame of ctx.http.stream(request)) {
    if (frame.type !== "sse") continue;
    for (var event of chatParser.push(frame.data)) {
      if (translationParser) {
        if (event.type === "text.delta") {
          for (var item of translationParser.push(event.text))
            await ctx.emit(item);
        }
      } else await ctx.emit(event);
    }
  }
  var result = chatParser.finish();
  return translationParser ? translationParser.finish() : result;
}

exports.chat = async function (input, config, ctx) {
  return complete(input.messages, config, ctx);
};

exports.translate = async function (input, config, ctx) {
  var result = await complete(
    ctx.helpers.translation.buildMessages(input),
    config,
    ctx,
    input,
  );
  if (ctx.options.streaming) return result;
  return ctx.helpers.translation.parseResult(result.text, input);
};
```

`chatParser` takes per-frame `data`; `finish` verifies normal termination reasons and `[DONE]`. Translation feeds `text.delta` into `translationParser`; completed items trigger `item.complete`, and `finish` validates all IDs. Never output batch JSON tokens directly as translation text; aborted streams cannot be cached as successful. Prompts, input encoding, and parsing across all four formats must use the same `outputProtocol`. `text` emits single-item `item.delta`; `LINE` emits `item.complete` when a line finishes; `XML` emits `item.complete` when a `<t>` element closes. All require verifying clean termination and complete results before reporting success.

### 10.3 SSE / NDJSON

`ctx.http.stream` first returns `{type: "headers", status, headers}`, followed by `{type: "sse", event, data}` by default; when `streamFormat = "ndjson"`, it returns parsed `{type: "json", value}`. There is currently no arbitrary bytes stream interface. Vendor fields in NDJSON must be adapted by `script`, aggregating complete outputs and validating business termination without delegating to SSE Chat parsers, and never assuming EOF implies success. Declarative `protocol` rules strictly use Chat Completions-compatible SSE.

## 11. Prompts and Profile Parameters

### 11.1 Default Templates

Text services declare default prompts for different modes: single-item outputs `text`, while aggregated calls default to `JSON`. LINE/XML aggregation uses the matching template from Section 11.2 or user-bound aggregated prompts.

```json
{
  "defaultPrompts": {
    "batch": [
      {
        "id": "default",
        "name": "Default",
        "protocol": "json",
        "systemPrompt": "Translate the input items from {{sourceLanguage}} to {{targetLanguage}}. Return only a JSON array of {id,text}, keeping every ID. Glossary: {{glossary}}. Context: {{context}}",
        "userPrompt": "{{segments}}"
      }
    ],
    "nobatch": [
      {
        "id": "default",
        "name": "Default",
        "protocol": "text",
        "systemPrompt": "Translate the source text from {{sourceLanguage}} to {{targetLanguage}}. Output only the translated text, without explanations or Markdown fences. Glossary: {{glossary}}. Context: {{context}}",
        "userPrompt": "{{text}}"
      }
    ]
  }
}
```

| Slot | Capability | Injected Into |
| ---- | ---------- | ------------- |
| `nobatch` | `translate` | `systemPrompt` / `userPrompt`, protocol is `text` |
| `batch` | `translate` | Same, protocol is `json`, `line`, or `xml` (selected by aggregate mode) |
| `dictionary` | `dictionary` | `systemPrompt` → `instructions`, `userPrompt` → `userPrompt` |
| `subtitle` | `segmentSubtitle` | `systemPrompt` → `instructions` |
| `vlm` | `parseImage` | Concatenates `systemPrompt` and `userPrompt` → `prompt` |


Every defaultPrompts slot is a non-empty array of prompt objects. Each preset requires a stable id and a display name; optional nameI18n, description and descriptionI18n describe its use. At least one of systemPrompt/userPrompt must be a string. The first item is the plugin default. IDs are unique within a slot; selecting by ID survives reordering. Single-object slots are invalid. There is no separate default ID or VLM reference field.

The existing *PromptSlug fields store host prompt slugs or plugin:pluginId:serviceId:slot:presetId references (each segment URI-encoded). Choices only include the current service and matching prompt category. Empty scene selection follows the service; empty service selection follows the first plugin preset. Plugin-page previews are read-only. Instances keep independent snapshots until upgraded.

For translation, protocol belongs to each preset: batch supports json/line/xml (json if omitted), nobatch supports text (text if omitted). The selected protocol must drive message construction, complete response parsing and streaming parsing together. Script plugins must pass the same input to translation.buildMessages, parseResult and createStreamParser. Arbitrary custom formats require a plugin implementation; presets cannot supply executable parsers. Other task wire contracts remain unchanged.

### 11.2 Translation Variables

`protocol` translation and `translation.buildMessages` support `{{variableName}}`:

| Variable | Content |
| -------- | ------- |
| `items` | JSON representation of items with stable IDs |
| `segments` | JSON, LINE, or XML encoded according to `outputProtocol`; single original text for `text` |
| `text` | Single item text; multi-item items JSON |
| `sourceLanguage` / `from` / `fromLang` | Source language; defaults to `auto` if omitted |
| `targetLanguage` / `to` / `toLang` | Target language |
| `glossary` | Glossary JSON; `{}` if omitted |
| `context` / `tone` | Context / tone; empty if omitted |
| `title` / `description` / `summary` / `url` | `document` fields; empty if omitted |

Unknown variables are left untouched. If no template is provided, the SDK default template matching the current mode/protocol is used. Explicitly bound templates are never rewritten. `buildMessages`, `parseResult(text, input)`, and `createStreamParser(input)` share the same mode and protocol; the host binds helpers per invocation, so legacy scripts passing only `{items}` inherit the call protocol as well. Scripts with custom parsing must handle new fields manually. Other capabilities do not have generic template expanders and must be interpreted by `script`. Models, credentials, and voices belong to instance settings; languages, glossaries, and contexts belong to the current input and must not be hardcoded.

Here are the four reproducible default templates. Aggregated templates select the matching protocol in Prompt Management; single-item templates output plain text only:

```json
{
  "json": {
    "systemPrompt": "Translate the input items from {{sourceLanguage}} to {{targetLanguage}}. Return only a JSON array of {id,text}, keeping every ID. Glossary: {{glossary}}. Context: {{context}}",
    "userPrompt": "{{segments}}"
  },
  "text": {
    "systemPrompt": "Translate the source text from {{sourceLanguage}} to {{targetLanguage}}. Output only the translated text, without explanations or Markdown fences. Glossary: {{glossary}}. Context: {{context}}",
    "userPrompt": "{{text}}"
  },
  "line": {
    "systemPrompt": "Translate each input line from {{sourceLanguage}} to {{targetLanguage}}. Output only ID | Text lines, keeping every ID exactly once. Keep <br> for internal newlines. Do not output explanations or Markdown fences. Glossary: {{glossary}}. Context: {{context}}",
    "userPrompt": "{{segments}}"
  },
  "xml": {
    "systemPrompt": "Translate the text of each <t> element from {{sourceLanguage}} to {{targetLanguage}}. Output only <root><t id=\"ID\">Text</t></root>, keeping every ID exactly once. Escape XML entities and preserve internal newlines. Do not output explanations or Markdown fences. Glossary: {{glossary}}. Context: {{context}}",
    "userPrompt": "{{segments}}"
  }
}
```

LINE uses `ID | Text` with internal newlines encoded as `<br>`; XML uses `<root><t>` with escaped attributes and body; JSON uses `{id, text}` arrays with string IDs. The SDK re-sorts by input ID and forbids matching by return order; `text` rejects multi-item requests.

### 11.3 Preview and Customization

The plugin services table displays read-only previews of public default templates without executing scripts or expanding variables. When undeclared, "Plugin does not expose default prompts" is shown. The preview reflects the current template declaration and does not represent what legacy instances actually use.

Users can copy templates to Prompt Management to create entities and select them in instances. "Plugin internal default" uses the instance snapshot and is not overwritten by template updates. The modern SDK provides no `reqHook`/`resHook`, and service configurations lack source editor boxes. To modify protocols, edit source files, increment versions, and re-import and upgrade instances; legacy hook compatibility does not belong in the plugin SDK.

VLM presets follow model-specific task instructions: [DeepSeek-OCR examples](https://github.com/deepseek-ai/DeepSeek-OCR#prompts-examples), [PaddleOCR-VL-1.5 task map](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.5), and [OpenAI vision guidance](https://developers.openai.com/api/docs/guides/images-vision). General-purpose OpenAI-compatible presets are project-maintained templates, not a claim of optimality for every compatible model. Task descriptions state when raw Markdown or grounding tags may be returned; the host does not clean or parse those outputs. Parameterized text-location templates are not executable presets.

## 12. Installation, Updating, and Publishing

### 12.1 Sources

| Source | Preparation | Updating |
| ------ | ----------- | -------- |
| Official Catalog | Catalog and versioned ZIPs published by CI | Reads versions and SHA-256 from remote catalog |
| Folder | Select folder containing `manifest.json` at root | Select updated folder or ZIP |
| Local ZIP | ZIP root contains `manifest.json` | Select updated ZIP or folder |
| HTTPS ZIP | Direct link, no authentication or redirects required | Checks recorded URL |
| Public GitHub | Repository root contains Manifest and executable files | Queries default branch, archives pinned SHA |

GitHub imports use repository root URLs (e.g. `https://github.com/owner/repo`), supporting trailing slashes or `.git`, but rejecting `tree`/`blob`, subdirectories, private repositories, or tokens. The installer does not run npm or build tools; providing TypeScript source files alone is insufficient. Archiving strips one wrapping directory without searching subprojects; prevent large development dependencies from entering the archive.

Folder imports save the snapshot at import time without retaining filesystem paths, directory handles, or watching file changes. HTTPS downloads have a 60-second overall timeout and can be canceled during download and verification without persisting templates or index records.

### 12.2 Network Scope, Synchronization, and Uninstallation

Plugins require no manual permission prompts and are ready after configuration. The plugin list displays fixed network addresses; API base URLs are edited in service settings; actual requests are bounded by each service snapshot's declared scope. Normal setting edits affect new tasks only; disabling or deleting a service aborts that instance's active tasks across all pages.

Templates and icons are stored locally; index records and instances synchronize via host settings mechanisms; valid service snapshots synced to new devices require no re-authorization. Missing templates affect adding new instances and previews, but do not affect existing snapshot execution. GitHub restoration uses recorded SHAs and does not equal updating to the latest commit; if local files are missing, re-select the file or folder.

Uninstallation removes templates and sync index entries while preserving instances and configurations. To stop execution, disable or delete the corresponding service instances.

### 12.3 Upgrades

1. Keep plugin and service IDs stable; increment three-part `version` when modifying content.
2. Identical versions with matching fingerprints require no update; same version with altered content or downgrades is rejected; fingerprints represent canonicalized executable content free from compression or outer folder variance.
3. Confirm "Update Plugin": the dialog displays old/new versions, sources, and changes in network addresses, endpoint fields, services, and capabilities. If the old template is missing, incomplete comparison is noted. Existing instances maintain their original snapshots.
4. Updating templates does not alter existing instances; existing tests run against original implementations.
5. Upgrading existing instances shows field types, secret attributes, required/range constraints, model catalogs, and default prompt changes, listing settings that cannot be copied. Prompts can be expanded, and known secrets are masked. Creating the updated instance copies compatible fields and still-supported capabilities; newly introduced capabilities are not auto-enabled.
6. Save configurations and test the new version, then replace references across scenarios while retaining old instances.

When field types or secret attributes change, compatibility of old values is not guaranteed. Modifying or deleting service IDs breaks standard upgrade mappings; the SDK provides no arbitrary configuration migration scripts.

### 12.4 Publishing

Release packages contain the Manifest, entry files, resources, icons, and the MIT LICENSE, excluding credentials, personal settings, `node_modules`, build caches, or local paths. The README documents protocols, capabilities, configurations, and version histories. Verify real calls locally before creating ZIPs; GitHub distribution requires verifying installation and updates via repository root URLs. Services with different protocols should specify their respective required base URLs.

### 12.5 Adding New Official Plugins in This Repository

Official plugins are maintained by KISS Translator and listed alongside external plugins on the host page without switching tabs. Lists only load metadata without installing automatically; both official and external plugins require clicking to install over the network. Official status indicates maintenance by this project and does not imply vendor endorsement.

1. Create `manifest.json`, `services/`, and `README.md` under `plugins/<plugin-id>/`, with an initial version typically `1.0.0`. The folder name must match the stable plugin ID; each directory represents an independent package. Educational samples go into `examples/` and are not included in the official catalog.
2. Split services by models and endpoints, declaring genuine capabilities; prioritize declarative `protocol`, use `http` for fixed single-request mappings, and use `script` when filename handling, message ordering, or result transformation requires logic. Model catalogs, default prompts, and localized names/field descriptions are maintained within the plugin without modifying host interfaces.
3. Add standalone `*.test.cjs` adapter tests under `plugins/<plugin-id>/tests/`, using SDK test doubles to verify vendor parameters, message structures, asset transforms, and error handling (refer to [SiliconFlow Tests](../plugins/siliconflow/tests/siliconflow.test.cjs)). Tests requiring real host SDKs must be named `*.host.test.cjs` and executed via optional `npm run test:host`; default tests must never import host source code directly or indirectly. Standalone unit tests do not prove SDK or browser behavior.
4. Run basic checks and builds in the repository root:

   ```sh
   npm ci
   npm run check
   npm test
   npm run build
   ```

   Requires only Node.js 22 and this repository's dependencies. `npm test` automatically runs root packaging regressions and plugin `*.test.cjs` adapter tests, excluding `*.host.test.cjs`; live vendor tests run explicitly and separately. Packaging, default tests, and CI do not read or download host source code.

5. For additional host SDK verification, set `KISS_TRANSLATOR_ROOT` and run `npm run test:host` (not a release blocker). Shared host loaders and Sval adapters reside in `tests/support/`, while vendor test cases stay in plugin directories. Import ZIPs or plugin folders into extensions for acceptance testing; run minimal live requests per service when credentials exist, or document unverified status when credentials are unavailable. Never commit keys to source code, logs, or release packages. Record standalone tests, host integration, live vendor calls, and browser acceptance separately.
6. Verify `dist/<plugin-id>/<version>.zip` and `dist/catalog.json`. Build scripts scan `plugins/`, packaging Manifest-referenced files, resources, icons, and the root MIT LICENSE, generating catalog entries and ZIP SHA-256 hashes automatically without manual editing; READMEs and test files are excluded from packages.
7. Modifying published package contents requires incrementing the plugin's three-part Manifest version; overwriting or downgrading released versions is forbidden. The build uses deterministic file ordering and timestamps for reproducibility; local `dist/` is git-ignored and not committed.
8. Upon merging to `main`, [GitHub Actions](../.github/workflows/publish.yml) executes unified checks, packaging regressions, standalone adapter tests, and builds, restoring historical archives and publishing to the `dist` branch; pull requests only validate without publishing. After release, inspect the [Public Catalog](https://raw.githubusercontent.com/fishjar/kiss-translator-plugins/dist/catalog.json), download the new ZIP, verify its SHA-256, and confirm plugin ID, version, and installability.

**Validation hashes are governed by CI-published catalogs and actual ZIPs.** The host fetches the official catalog dynamically and validates ZIPs without embedding packages, catalog snapshots, or release hashes in host source code; adding or updating plugins compatible with the existing SDK requires no host code changes or releases. Clients may cache catalogs and save verification hashes of installed packages for restoration checks.

The official repository contains multiple plugins; do not use the repository root URL as a single-plugin install URL. Install via the official catalog or using standalone ZIPs; during development, import individual `plugins/<plugin-id>/` folders. Updating templates will not alter existing service instances.

### 12.6 External Plugin Discovery

External authors can add the `kiss-translator-plugin` topic to public GitHub repositories for host auto-discovery; topics do not imply official verification. One external repository corresponds to one plugin, and the default branch root must contain `manifest.json` and executable files. Plugins without topics can still be imported via repository URLs, HTTPS ZIPs, ZIP files, or folders.

## 13. Debugging and Troubleshooting

### 13.1 Unified Checks and Offline Protocol Tests

Default development and CI require only this repository and Node.js 22, without host source code or pinning to host branches or commit SHAs:

```sh
npm ci
npm run check                      # Check all official plugins
npm run check -- plugins/deepseek  # Check a specific directory
npm run check -- /path/plugin.zip  # Check a specific ZIP
npm test                          # Packaging regression + standalone adapter tests
npm run build
```

`check` shares package validations with the build, covering Manifest identity and version formats, referenced paths/files, sizes, script syntax, and declarative handler mappings. Directory checks only inspect files referenced by publication; ZIP checks do not execute scripts. This check does not replicate full host SDK, permissions, or runtime validation, nor does it inspect the publisher machine's host version. `minHostVersion` can declare future versions, leaving compatibility to consuming hosts.

`npm run test:protocol` gathers plugin `*.test.cjs` files (excluding `*.host.test.cjs`), validating vendor adaptation logic using SDK test doubles without calling vendor APIs. Default protocol tests intercept global `fetch`; live vendor calls use separate `live.cjs` scripts and are excluded from default test suites.

Optionally run `npm run test:host` to verify against the real SDK: point `KISS_TRANSLATOR_ROOT` to a host directory with installed dependencies (defaults to adjacent `kiss-translator`). Only this command and tests invoking it require the host. Integration tests do not replicate real Worker/RPC isolation and require browser verification; it is not a prerequisite for packaging, CI, or publishing.

Both repositories align contracts via numeric `apiVersion`. The catalog preserves explicit `apiVersion`; positive safe integers not yet supported appear as incompatible; strings are invalid catalog data. Validation is repeated at installation and execution. The publisher validates independently without host source code.

### 13.2 Extension Verification

1. Import and create/upgrade instances in the current version, verifying source versions.
2. Save configurations and test each declared capability individually.
3. When both `complete` and `stream` are declared, test final results with streaming toggled off and on.
4. Use real images/audio for file tests without manual IDs, and use structured JSON for subtitles and decisions; single-item translation tests cannot substitute for batch tests.
5. Test real scenarios for ID disorder, glossaries, contexts, coordinates, grouping, audio playback, etc.
6. Verify normal execution, invalid credentials, business errors, cancellations, timeouts, missing/duplicate IDs, and truncated streams.
7. Verify configuration isolation between instances, ensuring template updates leave old instances untouched while new versions take effect.

Declarative `protocol` delegates protocol handling to the host, but vendor compatibility and model parameters still require live testing by authors. Passing mocks does not prove that installers, brokers, security isolation, or live vendor endpoints work.

### 13.3 Troubleshooting Table

| Phenomenon / Error Code | Investigation Steps |
| ----------------------- | ------------------- |
| `INVALID_PACKAGE` | Check root directory, wrapping folder, paths, file counts, and archive sizes |
| `INVALID_MANIFEST` / `INVALID_RULE` | Check version types, mixing http/v2, reserved parameters, handler/task names, boolean conditions, and secret fields |
| `SETTING_CONFLICT` / `INVALID_CONFIG` | Check type and secret mismatches, required constraints, numbers, select values, and capability-visibility rules |
| `HANDLER_MISSING` / `Script handler not found` | Check handler name casing between `exports` and `handlers` |
| `SCRIPT_ERROR` | Check globals, ES modules, dependencies, and Sval syntax; passing in Node.js does not guarantee Sval compatibility |
| `SECRET_UNAVAILABLE` | Check secret declarations, non-empty saved values, and `$secret`/`ref` keys |
| `NETWORK_DENIED` | Check declared `origin` scopes, plain remote HTTP, or redirects |
| `HTTP_ERROR` | Check URL, model, credentials, and parameters; vendor error bodies are omitted |
| `INVALID_RESPONSE` / `INCOMPLETE_RESPONSE` | Check standard schemas, JSON formatting, refusals, missing/duplicate IDs, and stream truncation |
| `CAPABILITY_DISABLED` / `SERVICE_UNAVAILABLE` | Check user-enabled capabilities, service declarations, disabled services, and complete configs |
| `BATCH_UNSUPPORTED` / `INPUT_LIMIT_EXCEEDED` | Check `batch.supported` and `maxItems` limits |
| `MODALITY_UNSUPPORTED` / `TASK_UNSUPPORTED` | Check modalities, image task modes, and model capabilities |
| `STREAM_UNSUPPORTED` / `STREAM_ENDED` | Check stream declarations, protocol mixing, and data emitted after termination |
| `INVALID_ASSET` / `ASSET_UNAVAILABLE` | Check MIME types, formats, and cross-task asset references |
| `RESOURCE_BUDGET_EXCEEDED` | Check sizes, event budgets, pending operations, and stream counts |
| `SCRIPT_TIMEOUT` / `REQUEST_TIMEOUT` | Check synchronous execution blocks, network stalls, and overall deadlines |
| Unchanged behavior after update | Check if running on an old snapshot or an upgraded instance |

### 13.4 Host SDK Regression (Optional)

Plugin builds and protocol tests in this repository are covered in Section 12.5. If modifying the SDK concurrently, run tests from the root of [KISS Translator Host Repository](https://github.com/fishjar/kiss-translator) after installing dependencies:

```powershell
$env:CI = "true"
pnpm test --watchAll=false --runInBand src/providers/declarative.test.js src/providers/scriptIntegration.test.js src/providers/declarativeIntegration.test.js src/providers/translationIntegration.test.js
```

The host tests the SDK using synthetic test plugins without storing official version snapshots. Vendor models, parameters, and protocol regressions are maintained by tests within this repository. Automated tests cannot replace real browser and end-to-end vendor verification. See [OpenAI Compatible Protocol Plugin](../plugins/openai-compatible-bundle/README.en.md), [DeepSeek Plugin](../plugins/deepseek/README.en.md), and [SiliconFlow Acceptance Record](../plugins/siliconflow/ACCEPTANCE.md).

## 14. Pre-release Checklist

- [ ] Installs cleanly from an empty directory per instructions, with correct root, entry, and resource structures.
- [ ] Stable ID, incremented version, free of credentials, personal configurations, or local filesystem paths.
- [ ] Valid executor and rule versions, with capabilities matching actual handlers.
- [ ] Only declares verified features: streaming, batching, modalities, coordinates, task modes, and timestamps.
- [ ] Standard input, result, and event structures; full translation IDs and correct subtitle grouping orders.
- [ ] Validated for both `complete` and `stream`; fails gracefully on missing terminations, missing/duplicate items, and errors.
- [ ] Cancellations, timeouts, and parsing failures never resolve as empty successes; asynchronous SDK calls are properly awaited.
- [ ] Precise `origin` scopes; secrets accessed solely via references, bindings, or signatures without logging or outputting to errors.
- [ ] Proper instance and asset isolation within size and operation budgets.
- [ ] Consistent template protocols handling languages, glossaries, contexts, and explicit prompts.
- [ ] Verified in actual extension installation and configuration scenarios, documenting tested vendors and model scopes.
- [ ] Upgrades and reference replacements verified, ensuring old instances retain their original snapshots.
- [ ] Official plugins pass independent versioning, tests, and builds; CI catalog, ZIP, and SHA-256 match without requiring host release snapshot updates.

### Multilingual UI Labels

Plugins and services can declare localized names via `nameI18n`, and settings fields and options can declare localized labels via `labelI18n`. Base `name` and `label` remain base strings without modifying model IDs, option values, or user-saved service names. Example:

```json
{
  "key": "baseUrl",
  "label": "API Base URL",
  "labelI18n": {
    "zh": "API 基础地址",
    "en": "API base URL",
    "zh_TW": "API 基礎位址"
  },
  "type": "text"
}
```

Supported language codes are `en`, `zh`, `zh_TW`, `ja`, `ko`, `tr`, `vi`, and `ru`; translations must be strings. The UI prioritizes the active UI language, falls back to `en`, and lastly uses base strings. Name translations persist with snapshots and sync indices; legacy example packages with Chinese labels maintain fallback compatibility without requiring config rewrites. User-renamed services display custom user values.

### Base Capabilities for Official LLM Services

Official DeepSeek, OpenAI Compatible, OpenRouter, and SiliconFlow LLM services explicitly provide `translate`, `chat`, `segmentSubtitle`, and `dictionary`. The host will not synthesize missing capabilities for third-party `chat` services; plugins must declare and implement corresponding handlers.

Plugin API 1 completes standard network tasks; official plugins use `apiVersion: 1` without relying on host release numbers to determine capabilities. `dictionary` constructs messages by replacing `{{text}}`, `{{sourceLanguage}}`, `{{language}}`, `{{context}}`, and language aliases like `{{from}}`/`{{to}}` in `instructions`/`userPrompt`, returning `{text, format: "markdown"}` with complete and streaming support. `segmentSubtitle` constructs messages with items, languages, and contexts, returning `{groups: [{ids, text, translation?}]}` with complete support only; all IDs must be covered exactly once in input order. Task instructions for grouping or phrasing are preserved; output structure is governed by the host `groups` contract.

Script plugins can reuse message generation and validation via `ctx.helpers.textTasks.buildMessages(task, input)` and `parseResult(task, text, input)`; default prompts are declared in `defaultPrompts.dictionary`/`subtitle`, with scenario- or user-provided instructions taking precedence.

## Plugin API 1 Common Task Helpers and Compatibility Maintenance

`ctx.helpers.textTasks.buildMessages(task, input, descriptor?)` supports `summarize`, `dictionary`, `detectLanguage`, `suggest`, `segmentSubtitle`, `evaluate`, `recognizeText`, `parseImage`, and `analyzeLayout`, returning standard messages. `parseResult(task, text, input, descriptor?)` verifies complete results; `descriptor.coordinates` determines whether OCR uses the JSON coordinate contract, while `descriptor.model`/`usage` for `evaluate` are provided by the actual request model and response metadata. Unknown tasks, empty outputs, invalid JSON, missing or unordered subtitle IDs, and out-of-candidate languages throw errors and are not cached as successes. Coordinate-less OCR does not attempt to guess regions from arbitrary outputs.

`ctx.helpers.openai.chatCompletions.prepareMessages(messages, readAsset)` is an asynchronous utility converting standard image/audio `AssetRef` messages into `image_url`/`input_audio`; `readAsset` uses `ctx.assets.read`. Plain text messages are left unchanged. MIME types, permissions, and sizes are validated; model acceptance of multimodal payloads must be verified independently.

<!-- api1-script-example -->

```javascript
exports.summarize = async function (input, config, ctx) {
  var sdk = ctx.helpers.openai.chatCompletions;
  var messages = ctx.helpers.textTasks.buildMessages("summarize", input);
  var response = await ctx.http.request(
    sdk.buildRequest({
      baseUrl: config.baseUrl,
      model: config.model,
      auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
      messages: messages,
      stream: false,
    }),
  );
  var result = sdk.parseResponse(response);
  return ctx.helpers.textTasks.parseResult("summarize", result.text, input);
};
```

This example implements `complete` only, so the service must declare `outputModes: ["complete"]`. Streaming implementations must consume SSE frames individually, await `ctx.emit`, and call `parser.finish()` at completion; missing terminal frames or incomplete outputs must fail and cannot treat previews as success. Image tasks must call `prepareMessages` prior to sending requests.

New default prompt slots include `summary` → `summarize`, `detectLanguage`, `suggest`, `evaluate`, `recognizeText`, and `analyzeLayout`, alongside existing `batch`, `nobatch`, `dictionary`, `subtitle`, and `vlm`. Text tasks support `instructions`/`userPrompt`; image tasks use `prompt`. Explicit inputs take precedence over plugin defaults; selecting "Plugin internal default" uses the instance snapshot without fetching remote templates. `textTasks` supports `text`, `transcript` (alias for text in summaries), `sourceLanguage`, `targetLanguage`, `language`, `from`/`fromLang`, `to`/`toLang`, `context`, `title`, `description`, `summary`, `url`, `tone`, `glossary`, and `items`; missing text variables are empty, languages default to `auto`, and `glossary` formats as a `- term: value` list. Translation helpers continue formatting `glossary` as a JSON object. Input payloads and output schemas for structured tasks are fixed by the SDK; users may only customize task instructions without altering wire formats.

Plugin API 1 uses numeric `apiVersion: 1` as the sole contract version. Vendor endpoints, models, and prompt adjustments generally increment plugin `version` only; `apiVersion` is incremented when introducing contracts that legacy hosts cannot handle correctly. The host accepts only integer `1` and does not support legacy contracts or automatic instance migrations. `minHostVersion` is reserved for host feature dependencies outside the contract, omitted in standard adapters.

Installing a new package updates templates only. Users create or upgrade snapshots via the existing instance upgrade flow; original accounts, models, explicit prompts, and capability selections are preserved in preview without automatic overwrites. SDKs supported by templates and instances are re-verified at execution boundaries. Generic prompts and documentation examples in Plugin API 1 enter host integration regressions; new capabilities must provide complete support matrices, input/output schemas, invalid declaration checks, and tests across both execution modes.

Acceptance records track: static packaging and syntax checks, protocol tests mocking vendor HTTP, production SDK/interpreter integration, real browser Worker/RPC, and live vendor requests. Earlier checks cannot replace later ones; real output quality requires task-specific test cases. Run `npm run check`, `npm test`, `npm run test:host`, and `npm run build`, alongside host provider tests and Chrome builds. During development, simply rebuild and load a host supporting Plugin API 1 without altering host release numbers.

For current tests, builds, and real browser/vendor acceptance boundaries, see [Plugin API 1 Acceptance Record](plugin-api-1-acceptance.md).

## Plugin API 1 Audio Assets and Remote Decisions

Audio, remote decisions, standard tasks, and prompt tools belong to Plugin API 1; external subtitle timings uniformly use seconds.

HTTP requests specifying `responseType: "asset"` can provide `responseAudio: { encoding: "pcm_s16le", sampleRate: 24000, channels: 1 }`. This field belongs to Plugin API 1, fixing encoding to signed 16-bit little-endian PCM, `sampleRate` to an integer between 8000–192000, and `channels` to an integer between 1–8. The host wraps raw PCM into WAV, returning an `audio/wav` asset; existing RIFF/WAVE files are validated for container length, chunk boundaries, `fmt`, and non-empty `data`, preserving raw bytes and permitting trailing chunks. This is limited container validation without decoding or guaranteeing browser playback. Empty responses, misaligned sample frames, and non-PCM contents are rejected. Transformed files (including the 44-byte WAV header) count against the task limit of 8 files / 8 MiB prior to output Blob creation; this budget is not process peak memory, and HTTP read buffers still consume memory. Assets without this field are left unmodified.

Declarative `$url.path` must be a relative path, forbidding absolute URLs, backslashes, control characters, invalid percent-encodings, and path segments resolving to `..`. The host normalizes the base path, constructs the URL, strips queries and fragments from the base URL, and verifies that the final origin matches and the pathname remains within that directory; failures report `INVALID_RULE` before making HTTP calls. This check constrains URL resolution; how servers interpret doubly-encoded paths remains server-dependent.

Remote `evaluate` results are no longer tied to local engine model names. `model` is the vendor model ID; `answers` must strictly cover questions with matching types; `usage` preserves vendor metrics. `confidence` and `action` are optional metadata, validated for proper probabilities when present, and never fabricated to satisfy contracts. Local Jev results remain unchanged. Initial standard question types are `choice`, `score`, and `noul`, excluding `box` or image inputs. Plugin Choice criteria only allows non-empty objects whose option keys are non-blank; keys are returned identifiers and values are descriptions (`Json`), where the resulting `choice` must belong to the criteria object's own keys (e.g. `{"en": "English text", "zh": "Chinese text"}` returning `en` or `zh`). Array inputs are rejected immediately without conversion or compatibility layers. Local inference engine formats are maintained separately and unaffected.

For OpenRouter adaptation and live API / browser acceptance, see [OpenRouter Acceptance Record](../plugins/openrouter/ACCEPTANCE.md).
