// Compile host source in this test process only. Never writes into the host checkout.
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const host = path.resolve(
  process.env.KISS_TRANSLATOR_ROOT ||
    path.resolve(__dirname, "../../../kiss-translator"),
);
const hostRequire = Module.createRequire(path.join(host, "package.json"));
// Test unreleased minimum-host contracts without changing the checkout or production checks.
if (process.env.KISS_TRANSLATOR_TEST_VERSION) {
  if (!/^\d+\.\d+\.\d+$/.test(process.env.KISS_TRANSLATOR_TEST_VERSION))
    throw new Error("Invalid test host version");
  hostRequire("./package.json").version =
    process.env.KISS_TRANSLATOR_TEST_VERSION;
}
if (!fs.existsSync(path.join(host, "src/providers/package.js")))
  throw new Error(
    "Host source is missing. Set KISS_TRANSLATOR_ROOT to a kiss-translator checkout.",
  );
let babel;
try {
  babel = hostRequire("@babel/core");
} catch {
  throw new Error(
    "Host dependencies are missing. Run pnpm install --frozen-lockfile in " +
      host,
  );
}
const original = Module._extensions[".js"];
const sourceRoot = path.join(host, "src") + path.sep;
Module._extensions[".js"] = function (module, filename) {
  if (!filename.startsWith(sourceRoot)) return original(module, filename);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    filename,
    babelrc: false,
    configFile: false,
    presets: [
      [
        hostRequire.resolve("@babel/preset-env"),
        { targets: { node: "current" }, modules: "commonjs" },
      ],
    ],
  });
  module._compile(code, filename);
};
module.exports = {
  hostRequire,
  load: (file) => require(path.join(host, "src", file)),
};
