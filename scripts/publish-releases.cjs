const { copyFileSync, mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { compareVersion } = require("./build.cjs");
const { publishReleases } = require("./publish-release.cjs");

// Snapshot of the dist catalog at 780b140, before Releases synchronization.
const baseline = require("./release-baseline.json");
const { plugins } = JSON.parse(readFileSync("dist/catalog.json", "utf8"));
const updated = plugins.filter(({ id, version }) =>
  !Object.hasOwn(baseline, id) || compareVersion(version, baseline[id]) > 0,
);

const staging = mkdtempSync(join(tmpdir(), "plugin-releases-"));
try {
  const packages = updated.map(({ id, version, sha256 }) => {
    const file = join(staging, `${id}-${version}.zip`);
    copyFileSync(join("dist", id, `${version}.zip`), file);
    return { tag: `${id}-v${version}`, file, digest: sha256 };
  });
  publishReleases(packages, { latest: false });
} finally {
  rmSync(staging, { recursive: true, force: true });
}
