const fs = require("node:fs");
const path = require("node:path");

async function check(target) {
  const {
    readPackageDirectory,
    readPackageZip,
    validatePackageFiles,
  } = require("./package-files.cjs");
  const files = fs.statSync(target).isDirectory()
    ? readPackageDirectory(target)
    : readPackageZip(new Uint8Array(fs.readFileSync(target)));
  const manifest = validatePackageFiles(files);
  return {
    id: manifest.id,
    version: manifest.version,
    kind: manifest.kind ?? "provider",
    services: manifest.services.map((service) => service.id),
  };
}

async function main() {
  const targets = process.argv.slice(2);
  if (!targets.length) {
    const root = path.resolve(__dirname, "../plugins");
    targets.push(
      ...fs
        .readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(root, entry.name)),
    );
  }
  for (const target of targets) {
    try {
      console.log(
        JSON.stringify({
          path: target,
          ...(await check(path.resolve(target))),
        }),
      );
    } catch (error) {
      console.error(
        `${target}: ${error.code || "CHECK_FAILED"}: ${error.message}`,
      );
      process.exitCode = 1;
    }
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { check };
