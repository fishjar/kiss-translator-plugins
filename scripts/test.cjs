const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const mode = process.argv[2];
function collect(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory()
      ? collect(file)
      : (
            mode === "host"
              ? entry.name.endsWith(".host.test.cjs")
              : entry.name.endsWith(".test.cjs") &&
                !entry.name.endsWith(".host.test.cjs")
          )
        ? [file]
        : [];
  });
}
if (!["packages", "protocol", "host"].includes(mode))
  throw new Error("Expected packages, protocol or host");
const files =
  mode === "packages"
    ? fs
        .readdirSync(path.join(root, "tests"))
        .filter((name) => name.endsWith(".test.cjs"))
        .map((name) => path.join(root, "tests", name))
    : fs
        .readdirSync(path.join(root, "plugins"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => {
          const folder = path.join(root, "plugins", entry.name, "tests");
          return fs.existsSync(folder) ? collect(folder) : [];
        });
if (!files.length) throw new Error("No " + mode + " tests found");
const result = spawnSync(
  process.execPath,
  [
    ...(mode !== "packages"
      ? ["--require", path.join(root, "tests/support/offline.cjs")]
      : []),
    "--test",
    ...files.sort(),
  ],
  { stdio: "inherit", cwd: root },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
