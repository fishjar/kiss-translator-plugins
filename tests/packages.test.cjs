const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { unzipSync } = require("fflate");
const { buildPackage, build } = require("../scripts/build.cjs");
const root = path.resolve(__dirname, "..");
test("package bytes are independent of source line endings", () => {
  const project = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "kiss-plugin-eol-"));
  try {
    for (const folder of fs.readdirSync(path.join(root, "plugins"))) {
      const target = path.join(project, folder);
      fs.cpSync(path.join(root, "plugins", folder), target, { recursive: true });
      const original = buildPackage(target);
      const files = unzipSync(original.bytes);
      for (const eol of ["\n", "\r\n"]) {
        for (const [name, bytes] of Object.entries(files)) {
          if (/\.(json|js)$/.test(name)) {
            fs.writeFileSync(path.join(target, name), Buffer.from(bytes).toString("utf8").replace(/\r\n/g, "\n").replace(/\n/g, eol));
          }
        }
        assert.deepEqual(buildPackage(target).bytes, original.bytes, `${folder}: ${JSON.stringify(eol)}`);
      }
    }
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

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
    assert.equal(Buffer.from(files.LICENSE).toString("utf8"), fs.readFileSync(path.join(root, "LICENSE"), "utf8").replace(/\r\n/g, "\n"));
    assert.match(Buffer.from(files.LICENSE).toString("utf8"), /^MIT License\n/);
    const manifest = JSON.parse(Buffer.from(files["manifest.json"]));
    assert.equal(manifest.icon, "assets/logo.png");
    const icon = Buffer.from(files[manifest.icon]);
    assert.ok(icon.length <= 256 * 1024);
    assert.equal(icon.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(icon.toString("ascii", 12, 16), "IHDR");
    assert.equal(icon.readUInt32BE(16), 128);
    assert.equal(icon.readUInt32BE(20), 128);
    assert.ok(!Object.keys(files).some((name) => /logo-source|SOURCES\.md/.test(name)));
    assert.equal(manifest.id, pack.item.id);
    assert.equal(manifest.version, pack.item.version);
    for (const locale of ["zh", "en", "zh_TW", "ja", "ko", "tr", "vi", "ru"]) {
      assert.ok(manifest.descriptionI18n[locale]?.trim(), `${folder}: missing ${locale} description`);
      assert.equal(pack.item.descriptionI18n[locale], manifest.descriptionI18n[locale]);
      for (const service of manifest.services) assert.ok(service.nameI18n[locale]?.trim(), `${folder}/${service.id}: missing ${locale} name`);
    }
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
    const originalVersion = manifest.version;
    manifest.description += " changed";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => build(project), /Published/);
    manifest.version = "1.0.0";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => build(project), /cannot decrease/);
    const parts = originalVersion.split(".").map(Number);
    manifest.version = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    build(project);
    assert.ok(fs.existsSync(path.join(project, `dist/deepseek/${originalVersion}.zip`)));
    assert.ok(fs.existsSync(path.join(project, `dist/deepseek/${manifest.version}.zip`)));
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});
