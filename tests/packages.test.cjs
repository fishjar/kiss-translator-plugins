const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { unzipSync } = require("fflate");
const { buildPackage, build } = require("../scripts/build.cjs");
const root = path.resolve(__dirname, "..");
test("package bytes are independent of the builder timezone", () => {
  const { execFileSync } = require("node:child_process");
  const source = `const { buildPackage } = require(${JSON.stringify(path.join(root, "scripts/build.cjs"))}); console.log(buildPackage(${JSON.stringify(path.join(root, "plugins/deepseek"))}).item.sha256);`;
  const hash = (timezone) => execFileSync(process.execPath, ["-e", source], { env: { ...process.env, TZ: timezone }, encoding: "utf8" }).trim();
  assert.equal(hash("UTC"), hash("Asia/Shanghai"));
});
for (const folder of fs.readdirSync(path.join(root, "plugins"))) {
  test(`${folder}: deterministic installable archive with no development files`, () => {
    const pack = buildPackage(path.join(root, "plugins", folder));
    assert.deepEqual(pack.bytes, buildPackage(path.join(root, "plugins", folder)).bytes);
    const files = unzipSync(pack.bytes);
    const manifest = JSON.parse(Buffer.from(files["manifest.json"]));
    assert.equal(manifest.id, pack.item.id);
    assert.equal(manifest.version, pack.item.version);
    for (const service of manifest.services) assert.ok(files[service.implementation.entry]);
    assert.ok(!Object.keys(files).some((name) => /README|test|package\.json/.test(name)));
    assert.ok(!manifest.services.some((service) => service.id === "signed-dictionary"));
  });
}

test("published versions cannot be replaced or downgraded", () => {
  const project = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "kiss-plugin-build-"));
  try {
    fs.cpSync(path.join(root, "plugins/deepseek"), path.join(project, "plugins/deepseek"), { recursive: true });
    build(project);
    const catalogPath = path.join(project, "dist/catalog.json");
    const catalog = JSON.parse(fs.readFileSync(catalogPath));
    catalog.plugins.push({ ...catalog.plugins[0], id: "removed-plugin" });
    fs.writeFileSync(catalogPath, JSON.stringify(catalog));
    build(project);
    assert.deepEqual(JSON.parse(fs.readFileSync(catalogPath)).plugins.map((entry) => entry.id), ["deepseek"]);
    const manifestPath = path.join(project, "plugins/deepseek/manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath));
    manifest.description += " changed";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => build(project), /Published/);
    manifest.version = "1.0.0";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => build(project), /cannot decrease/);
    manifest.version = "1.2.3";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    build(project);
    assert.ok(fs.existsSync(path.join(project, "dist/deepseek/1.2.2.zip")));
    assert.ok(fs.existsSync(path.join(project, "dist/deepseek/1.2.3.zip")));
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});
