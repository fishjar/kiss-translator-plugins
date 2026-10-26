const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { zipSync } = require("fflate");

const root = path.resolve(__dirname, "..");
const base = "https://raw.githubusercontent.com/fishjar/kiss-translator-plugins/dist";
const safePath = (value) => typeof value === "string" && /^[\w./-]+$/.test(value) && !value.startsWith("/") && !value.split("/").some((part) => ["", ".", ".."].includes(part));

function buildPackage(folder) {
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, "manifest.json"), "utf8"));
  if (manifest.manifestVersion !== 1 || manifest.apiVersion !== "1" || !/^[a-z][a-z0-9-]{1,100}$/.test(manifest.id) || !/^\d+\.\d+\.\d+$/.test(manifest.version) || !manifest.services?.length) throw new Error("Invalid manifest: " + folder);
  const ids = new Set();
  const entries = new Set(["manifest.json"]);
  for (const service of manifest.services) {
    if (ids.has(service.id) || !/^[A-Za-z][\w-]{0,100}$/.test(service.id) || !["declarative", "script"].includes(service.implementation?.kind) || !Object.keys(service.capabilities || {}).length) throw new Error("Invalid service: " + service.id);
    ids.add(service.id);
    if (!safePath(service.implementation.entry)) throw new Error("Invalid service entry path");
    entries.add(service.implementation.entry);
    if (service.implementation.kind === "declarative") JSON.parse(fs.readFileSync(path.join(folder, service.implementation.entry), "utf8"));
  }
  for (const resource of manifest.resources || []) entries.add(resource.path);
  if (manifest.icon) entries.add(manifest.icon);
  const files = {};
  for (const entry of [...entries].sort()) {
    if (!safePath(entry)) throw new Error("Invalid package path: " + entry);
    files[entry] = [fs.readFileSync(path.join(folder, entry)), { mtime: new Date("2000-01-01T00:00:00Z") }];
  }
  const bytes = Buffer.from(zipSync(files, { level: 9 }));
  if (bytes.length > 5 * 1024 * 1024) throw new Error("Package exceeds 5 MiB");
  const relative = `${manifest.id}/${manifest.version}.zip`;
  return { bytes, relative, item: {
    id: manifest.id, name: manifest.name, nameI18n: manifest.nameI18n,
    description: manifest.description, descriptionI18n: manifest.descriptionI18n,
    version: manifest.version, apiVersion: manifest.apiVersion,
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
