// Compile host source in this test process only. Never writes into the host checkout.
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const host =
  process.env.KISS_TRANSLATOR_ROOT ||
  path.resolve(__dirname, "../../../../kiss-translator");
const hostRequire = Module.createRequire(path.join(host, "package.json"));
const babel = hostRequire("@babel/core");
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
