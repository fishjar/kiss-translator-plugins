const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const locales = ["zh", "en", "zh_TW", "ja", "ko", "tr", "vi", "ru"];

// Official metadata policy only; this does not restrict third-party packages.
function checkLabels(manifest) {
  const groups = [
    ["shared", manifest.sharedSettings || []],
    ...manifest.services.map((service) => [service.id, service.settings || []]),
  ];
  for (const [group, fields] of groups) {
    for (const field of fields) {
      if (field.key === "apiKey") continue;
      for (const locale of locales) {
        const label = field.labelI18n?.[locale];
        assert.ok(
          typeof label === "string" && label.trim(),
          `${manifest.id}/${group}/${field.key}: missing ${locale} label`,
        );
      }
    }
  }
}

const plugins = path.resolve(__dirname, "../plugins");
for (const folder of fs.readdirSync(plugins)) {
  test(`${folder}: official setting labels cover all eight languages`, () => {
    checkLabels(JSON.parse(fs.readFileSync(path.join(plugins, folder, "manifest.json"), "utf8")));
  });
}

test("label checks reject missing and blank translations in shared and service settings", () => {
  for (const group of ["shared", "service"]) {
    for (const invalid of [undefined, "", "  "]) {
      const field = { key: "model", labelI18n: Object.fromEntries(locales.map((locale) => [locale, "Model"])) };
      if (invalid === undefined) delete field.labelI18n.ja;
      else field.labelI18n.ja = invalid;
      const manifest = {
        id: "fixture", sharedSettings: group === "shared" ? [field] : [],
        services: [{ id: "chat", settings: group === "service" ? [field] : [] }],
      };
      assert.throws(() => checkLabels(manifest), /missing ja label/);
    }
  }
});

test("API Key labels need no translation dictionary", () => {
  assert.doesNotThrow(() => checkLabels({
    id: "fixture", sharedSettings: [{ key: "apiKey", label: "API Key" }],
    services: [{ id: "chat", settings: [{ key: "apiKey", label: "Provider API Key" }] }],
  }));
});
