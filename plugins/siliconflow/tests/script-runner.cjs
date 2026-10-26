const { hostRequire } = require("../../openrouter/tests/host.cjs");
const Sval = hostRequire("sval");

// Exercise the production script language with task-owned assets and the real broker.
// Worker/RPC transport is outside this Node test harness.
module.exports = async function runScript(snapshot, handler, input, ctx) {
  const interpreter = new Sval({ ecmaVer: 2020, sandBox: true });
  interpreter.run(snapshot.code);
  return interpreter.exports[handler](input, ctx.config, {
    ...ctx,
    assets: {
      read: async (ref) => {
        const blob = ctx.assets.get(ref);
        if (blob.type !== ref.mimeType)
          throw Object.assign(new Error("Image MIME type mismatch."), {
            code: "INVALID_ASSET",
          });
        return blob.arrayBuffer();
      },
    },
  });
};
