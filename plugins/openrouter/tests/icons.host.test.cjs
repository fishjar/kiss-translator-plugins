const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("../../../tests/support/host.cjs");
const { readProviderPackage } = load("providers/package.js");
const { buildPackage } = require("../../../scripts/build.cjs");

for (const id of ["deepseek", "openai-compatible-bundle", "openrouter", "siliconflow"]) {
  test(`${id}: production loader retains the installed package icon`, () => {
    const folder = path.resolve(__dirname, "../../", id);
    const pack = readProviderPackage(new Uint8Array(buildPackage(folder).bytes));
    assert.equal(pack.icon.mimeType, "image/png");
    assert.deepEqual(Buffer.from(pack.icon.data, "base64"), fs.readFileSync(path.join(folder, pack.manifest.icon)));
  });
}
