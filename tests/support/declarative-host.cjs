const path = require("node:path");
const { load } = require("./host.cjs");
const { buildPackage } = require("../../scripts/build.cjs");
const { readProviderPackage } = load("providers/package.js");
const { createServiceInstance, projectInstanceConfig } = load("providers/instances.js");
const { createAssetStore, createTransportBroker } = load("providers/transport.js");
const { runDeclarative } = load("providers/declarative.js");
const runScript = require("./script-runner.cjs");
const { providerHelpers } = load("providers/sdk/index.js");

// Real package loader, rule executor, SDK and transport; only fetch is injected.
module.exports = function fixture(plugin, service, config = {}) {
  const pack = readProviderPackage(new Uint8Array(
    buildPackage(path.resolve(__dirname, "../../plugins", plugin)).bytes,
  ));
  const instance = createServiceInstance(
    pack.manifest, service, pack.implementations[service],
    { apiKey: "test-only-secret", ...config }, "test-" + service,
  );
  const assets = createAssetStore(), calls = [];
  let respond = () => Response.json({
    choices: [{ message: { content: "Hello" }, finish_reason: "stop" }],
  });
  const ctx = {
    ...createTransportBroker(instance, {
      assets,
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return respond(url, init);
      },
    }),
    assets,
    config: projectInstanceConfig(instance).config,
    helpers: providerHelpers,
    options: { streaming: false },
    emit: async () => {},
  };
  return {
    instance, ctx, assets, calls, config: ctx.config,
    respond: (value) => { respond = value; },
    invoke: (handler, input) => instance.provider.implementation.kind === "script"
      ? runScript(instance.provider, handler, input, ctx)
      : runDeclarative(instance.provider, handler, input, ctx),
  };
};
