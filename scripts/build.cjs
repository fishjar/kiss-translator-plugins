const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { zipSync } = require("fflate");

const root = path.resolve(__dirname, "..");
const base = "https://raw.githubusercontent.com/fishjar/kiss-translator-plugins/dist";

function buildPackage(folder) {
  const { readPackageDirectory } = require("./package-files.cjs");
  const content = readPackageDirectory(folder);
  const manifest = JSON.parse(content["manifest.json"].toString("utf8"));
  const files = {};
  for (const entry of Object.keys(content).sort()) {
    files[entry] = [content[entry], { mtime: new Date(2000, 0, 1) }];
  }
  const bytes = Buffer.from(zipSync(files, { level: 9 }));
  if (bytes.length > 5 * 1024 * 1024) throw new Error("Package exceeds 5 MiB");
  const relative = `${manifest.id}/${manifest.version}.zip`;
  return { bytes, relative, item: {
    id: manifest.id, name: manifest.name, nameI18n: manifest.nameI18n,
    description: manifest.description, descriptionI18n: manifest.descriptionI18n,
    version: manifest.version, apiVersion: manifest.apiVersion,
    ...(manifest.kind !== undefined && { kind: manifest.kind }),
    ...(manifest.minHostVersion !== undefined && { minHostVersion: manifest.minHostVersion }),
    capabilities: [...new Set(manifest.services.flatMap((service) => Object.keys(service.capabilities)))],
    downloadUrl: `${base}/${relative}`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  } };
}

function build(projectRoot = root) {
  const dist = path.join(projectRoot, "dist");
  const previousFile = path.join(dist, "catalog.json");
  const previous = fs.existsSync(previousFile) ? JSON.parse(fs.readFileSync(previousFile)) : { schemaVersion: 1, plugins: [] };
  if (previous.schemaVersion !== 1 || !Array.isArray(previous.plugins)) throw new Error("Unsupported previous catalog");
  const packages = fs.readdirSync(path.join(projectRoot, "plugins"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => buildPackage(path.join(projectRoot, "plugins", entry.name)));
  const ids = new Set();
  for (const pack of packages) {
    if (ids.has(pack.item.id)) throw new Error("Duplicate plugin ID");
    ids.add(pack.item.id);
    const old = previous.plugins.find((item) => item.id === pack.item.id);
    if (old && compareVersion(pack.item.version, old.version) < 0) throw new Error("Plugin version cannot decrease");
    const file = path.join(dist, pack.relative);
    if (fs.existsSync(file) && !fs.readFileSync(file).equals(pack.bytes)) throw new Error("Published content changed; increase version: " + pack.relative);
    if (old?.version === pack.item.version && old.sha256 !== pack.item.sha256) throw new Error("Published fingerprint changed");
  }
  for (const pack of packages) {
    const file = path.join(dist, pack.relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, pack.bytes);
  }
  const plugins = packages.map((pack) => pack.item).sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(previousFile, JSON.stringify({ schemaVersion: 1, plugins }, null, 2) + "\n");
  console.log(`Built ${packages.length} plugins`);
}
function compareVersion(left, right) {
  const a = left.split(".").map(Number), b = right.split(".").map(Number);
  return a.map((value, index) => value - b[index]).find((diff) => diff !== 0) || 0;
}
if (require.main === module) build();
module.exports = { buildPackage, compareVersion, build };
