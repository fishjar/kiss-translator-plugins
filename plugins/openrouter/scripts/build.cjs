const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { createHash } = require("node:crypto");

const root = path.resolve(__dirname, "..");
const host =
  process.env.KISS_TRANSLATOR_ROOT ||
  path.resolve(__dirname, "../../../../kiss-translator");
let zipSync;
try {
  ({ zipSync } = require("fflate"));
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
  ({ zipSync } = createRequire(path.join(host, "package.json"))("fflate"));
}
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
);
const entries = [
  "manifest.json",
  ...new Set(manifest.services.map((service) => service.implementation.entry)),
];
const files = Object.fromEntries(
  entries
    .sort()
    .map((entry) => [
      entry,
      [
        fs.readFileSync(path.join(root, entry)),
        { mtime: new Date("2000-01-01T00:00:00Z") },
      ],
    ]),
);
const bytes = zipSync(files, { level: 9 });
const sha256 = createHash("sha256").update(bytes).digest("hex");
const dist = path.resolve(root, "../../dist");
const relative = `${manifest.id}/${manifest.version}.zip`;
const output = path.join(dist, relative);
if (
  fs.existsSync(output) &&
  !fs.readFileSync(output).equals(Buffer.from(bytes))
) {
  throw new Error(
    "Published package content changed; increase the manifest version.",
  );
}
const catalogPath = path.join(dist, "catalog.json");
const catalog = fs.existsSync(catalogPath)
  ? JSON.parse(fs.readFileSync(catalogPath, "utf8"))
  : { schemaVersion: 1, plugins: [] };
if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.plugins)) {
  throw new Error("Unsupported catalog format; refusing to replace it.");
}
const item = {
  id: manifest.id,
  name: manifest.name,
  nameI18n: manifest.nameI18n,
  description: manifest.description,
  descriptionI18n: manifest.descriptionI18n,
  version: manifest.version,
  apiVersion: manifest.apiVersion,
  capabilities: [
    ...new Set(
      manifest.services.flatMap((service) => Object.keys(service.capabilities)),
    ),
  ],
  downloadUrl: `https://raw.githubusercontent.com/fishjar/kiss-translator-plugins/dist/${relative}`,
  sha256,
};
catalog.plugins = [
  ...catalog.plugins.filter((plugin) => plugin.id !== item.id),
  item,
];
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, bytes);
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
console.log(`${output}\nSHA-256: ${sha256}\nCatalog: ${catalogPath}`);
