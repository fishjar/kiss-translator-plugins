const { hostRequire } = require("./host.cjs");
const Sval = hostRequire("sval");

// Exercise the production script language with task-owned assets and the real broker.
// Worker/RPC transport is outside this Node test harness.
module.exports = async function runScript(snapshot, handler, input, ctx) {
  const interpreter = new Sval({
    ecmaVer: "latest",
    sourceType: "script",
    sandBox: true,
  });
  interpreter.run(snapshot.code);
  return interpreter.exports[handler](input, ctx.config, {
    ...ctx,
    assets: {
      read: async (ref) => {
        if (!ctx.assets.get) return ctx.assets.read(ref);
        const blob = ctx.assets.get(ref);
        if (blob.type !== ref.mimeType)
          throw Object.assign(new Error("Asset MIME type mismatch."), {
            code: "INVALID_ASSET",
          });
        return blob.arrayBuffer();
      },
    },
  });
};
