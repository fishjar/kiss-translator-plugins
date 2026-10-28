const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { zipSync } = require("fflate");
const { check } = require("../scripts/check.cjs");
const { buildPackage } = require("../scripts/build.cjs");
const { readPackageZip } = require("../scripts/package-files.cjs");
const { packagePaths } = require("../scripts/package-files.cjs");

test("publisher rejects model-level capability declarations", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "../plugins/siliconflow/manifest.json"), "utf8"));
  const service = manifest.services.find((entry) => entry.id === "transcriptions");
  assert.doesNotThrow(() => packagePaths(manifest));
  for (const capabilities of [{}, { transcribe: { timestamps: false } }, null]) {
    service.models[0].capabilities = capabilities;
    assert.throws(() => packagePaths(manifest), /separate services/);
  }
});

test("injected LICENSE counts towards the final archive file and size limits", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kiss-license-limits-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = "exports.chat = () => ({ text: 'ok' });";
  const manifest = {
    apiVersion: 1, id: "license-test", version: "1.0.0",
    services: [{ id: "chat", implementation: { kind: "script", entry: "chat.js" }, capabilities: { chat: { handler: "chat" } } }],
    resources: Array.from({ length: 98 }, (_, index) => ({ path: `resource-${index}.txt` })),
  };
  fs.writeFileSync(path.join(dir, "chat.js"), source);
  for (const resource of manifest.resources) fs.writeFileSync(path.join(dir, resource.path), "");
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  assert.throws(() => buildPackage(dir), /file count/);

  manifest.resources = [{ path: "padding.bin" }];
  const json = JSON.stringify(manifest);
  fs.writeFileSync(path.join(dir, "manifest.json"), json);
  fs.writeFileSync(path.join(dir, "padding.bin"), Buffer.alloc(10 * 1024 * 1024 - Buffer.byteLength(json) - Buffer.byteLength(source)));
  assert.throws(() => buildPackage(dir), /exceeds 10 MiB/);
});

test("standalone directory and ZIP checks do not execute scripts or require a host", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kiss-check-"));
  try {
    const manifest = {
      apiVersion: 1,
      id: "check-test",
      version: "1.0.0",
      services: [
        {
          id: "chat",
          implementation: { kind: "script", entry: "chat.js" },
          capabilities: { chat: { handler: "chat" } },
        },
      ],
    };
    const files = {
      "manifest.json": Buffer.from(JSON.stringify(manifest)),
      "chat.js": Buffer.from('throw new Error("Must not run");'),
    };
    for (const [name, bytes] of Object.entries(files))
      fs.writeFileSync(path.join(dir, name), bytes);
    const zip = path.join(dir, "fixture.zip");
    fs.writeFileSync(zip, zipSync(files));
    assert.deepEqual(await check(dir), await check(zip));
    const legacy = buildPackage(dir);
    assert.equal(Object.hasOwn(legacy.item, "kind"), false);
    assert.equal(Object.hasOwn(legacy.item, "minHostVersion"), false);
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        ...manifest,
        kind: "provider",
        minHostVersion: "0.0.0",
      }),
    );
    assert.equal(buildPackage(dir).item.kind, "provider");
    assert.equal(buildPackage(dir).item.minHostVersion, "0.0.0");
    // Authors can publish a future requirement; the consuming host decides compatibility.
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({ ...manifest, minHostVersion: "999999.0.0" }),
    );
    assert.equal((await check(dir)).id, manifest.id);
    fs.writeFileSync(path.join(dir, "manifest.json"), files["manifest.json"]);
    assert.deepEqual(
      JSON.parse(
        Buffer.from(
          readPackageZip(new Uint8Array(fs.readFileSync(zip)))["manifest.json"],
        ).toString("utf8"),
      ),
      manifest,
    );
    for (const change of [
      { kind: "page" },
      { minHostVersion: "invalid" },
      { services: [] },
    ]) {
      const content = {
        ...files,
        "manifest.json": Buffer.from(
          JSON.stringify({ ...manifest, ...change }),
        ),
      };
      fs.writeFileSync(
        path.join(dir, "manifest.json"),
        content["manifest.json"],
      );
      fs.writeFileSync(zip, zipSync(content));
      await assert.rejects(check(dir));
      await assert.rejects(check(zip));
      assert.throws(() => readPackageZip(zipSync(content)));
      const result = spawnSync(
        process.execPath,
        [path.resolve(__dirname, "../scripts/check.cjs"), zip],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 1);
      assert.match(result.stderr, /fixture.zip.*INVALID_PACKAGE/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
