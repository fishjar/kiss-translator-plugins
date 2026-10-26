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

test("standalone directory and ZIP checks do not execute scripts or require a host", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kiss-check-"));
  try {
    const manifest = {
      manifestVersion: 1,
      apiVersion: "1",
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
