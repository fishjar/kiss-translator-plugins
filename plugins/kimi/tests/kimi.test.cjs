const test = require("node:test");
const assert = require("node:assert/strict");
const { script, probe } = require("../../../tests/support/plugin.cjs");
const manifest = require("../manifest.json");
const kimi = script("kimi", "services/chat.js");

// Objects created inside the script context have a different prototype.
const plain = (value) => JSON.parse(JSON.stringify(value));
const service = (id) => manifest.services.find((item) => item.id === id);
const field = (fields, key) => fields.find((item) => item.key === key);

async function sentBody(model, thinkingMode, thinkingEffort) {
  const f = probe();
  await kimi.chat(
    { messages: [{ role: "user", content: "Hello" }] },
    { ...f.config, model, thinkingMode, thinkingEffort },
    f.ctx,
  );
  assert.equal(f.built.length, 1);
  assert.equal(f.built[0].model, model);
  assert.equal(f.built[0].baseUrl, f.config.baseUrl);
  assert.equal(f.built[0].stream, false);
  assert.equal(f.built[0].auth.secret.key, "apiKey");
  return plain(f.built[0]);
}

const thinkingKeys = (body) => {
  const result = {};
  for (const key of ["thinking", "reasoning_effort"])
    if (Object.hasOwn(body, key)) result[key] = body[key];
  return result;
};

test("Kimi Code and open platform services share one script with their own defaults", () => {
  assert.equal(manifest.id, "kimi");
  assert.equal(manifest.apiVersion, 1);
  assert.deepEqual(manifest.permissions, {
    network: ["https://api.kimi.com", "https://api.moonshot.cn"],
    endpointFields: ["baseUrl"],
  });
  assert.deepEqual(manifest.services.map(({ id }) => id), ["kimi-code", "open-platform"]);
  for (const [id, baseUrl, model, models] of [
    ["kimi-code", "https://api.kimi.com/coding/v1", "kimi-for-coding", ["kimi-for-coding", "k3", "k3.1-pro"]],
    ["open-platform", "https://api.moonshot.cn/v1", "kimi-k2.6", ["kimi-k2.6", "kimi-k3", "kimi-k3.1-pro"]],
  ]) {
    const item = service(id);
    assert.deepEqual(item.implementation, { kind: "script", entry: "services/chat.js" });
    assert.deepEqual(item.capabilities, {
      chat: { handler: "chat", inputModalities: ["text"], outputModes: ["complete", "stream"] },
      translate: { handler: "translate", batch: { supported: true }, outputModes: ["complete", "stream"] },
      dictionary: { handler: "dictionary", outputModes: ["complete", "stream"] },
      segmentSubtitle: { handler: "segmentSubtitle", outputModes: ["complete"] },
    });
    assert.equal(field(item.settings, "baseUrl").defaultValue, baseUrl);
    assert.ok(manifest.permissions.network.includes(new URL(baseUrl).origin));
    assert.equal(field(item.settings, "model").defaultValue, model);
    assert.equal(item.modelField, "model");
    assert.deepEqual(item.models.map(({ id }) => id), models);
    assert.deepEqual(Object.keys(item.defaultPrompts), ["batch", "nobatch", "dictionary", "subtitle"]);
  }
  assert.deepEqual(service("kimi-code").defaultPrompts, service("open-platform").defaultPrompts);
  assert.equal(field(manifest.sharedSettings, "thinkingMode").defaultValue, "disabled");
  assert.equal(field(manifest.sharedSettings, "thinkingEffort").defaultValue, "_default");
  assert.ok(!manifest.services.some((item) =>
    [...manifest.sharedSettings, ...item.settings].some(({ key }) => /temperature/i.test(key))));
});

test("thinking parameters follow what each Kimi model accepts", async () => {
  const enabled = { thinking: { type: "enabled" } };
  const disabled = { thinking: { type: "disabled" } };
  const cases = [
    // Kimi Code models that can turn thinking off.
    ...["kimi-for-coding", "k3", "k3-256k"].flatMap((model) => [
      [model, "disabled", "high", disabled],
      [model, "enabled", "_default", enabled],
      [model, "enabled", "max", { ...enabled, reasoning_effort: "max" }],
    ]),
    // Kimi Code K3.1 Pro rejects disabled thinking, so it falls back to low.
    ...["k3.1-pro", "k3.1-pro-highspeed"].flatMap((model) => [
      [model, "disabled", "_default", { ...enabled, reasoning_effort: "low" }],
      [model, "disabled", "high", { ...enabled, reasoning_effort: "low" }],
      [model, "enabled", "_default", enabled],
      [model, "enabled", "high", { ...enabled, reasoning_effort: "high" }],
    ]),
    // Switch only, no effort parameter.
    ...["kimi-k2.6", "kimi-for-coding-highspeed"].flatMap((model) => [
      [model, "disabled", "_default", disabled],
      [model, "enabled", "high", enabled],
    ]),
    // Open platform K3 always thinks and only accepts reasoning_effort.
    ...["kimi-k3", "kimi-k3.1-pro", "kimi-k3.1-pro-highspeed"].flatMap((model) => [
      [model, "disabled", "_default", { reasoning_effort: "low" }],
      [model, "enabled", "_default", {}],
      [model, "enabled", "high", { reasoning_effort: "high" }],
    ]),
    // Open platform K2.7 Code rejects any thinking control.
    ...["kimi-k2.7-code", "kimi-k2.7-code-highspeed"].flatMap((model) => [
      [model, "disabled", "_default", {}],
      [model, "enabled", "max", {}],
    ]),
    // Unknown models get no thinking parameters.
    ["moonshot-v1-8k", "disabled", "_default", {}],
    ["moonshot-v1-8k", "enabled", "high", {}],
    // Model IDs are matched without case or surrounding spaces.
    [" K3.1-Pro ", "disabled", "_default", { ...enabled, reasoning_effort: "low" }],
  ];
  for (const [model, mode, effort, expected] of cases) {
    const body = await sentBody(model, mode, effort);
    assert.deepEqual(thinkingKeys(body), expected, `${model} ${mode} ${effort}`);
  }
});

test("API default and missing thinking settings send no thinking parameters", async () => {
  for (const model of ["kimi-for-coding", "k3.1-pro", "kimi-k2.6", "kimi-k3"]) {
    for (const mode of ["auto", undefined]) {
      for (const effort of ["_default", "max", undefined]) {
        const body = await sentBody(model, mode, effort);
        assert.deepEqual(thinkingKeys(body), {}, `${model} ${mode} ${effort}`);
      }
    }
  }
});

test("K-series models never get sampling parameters and get an explicit output limit", async () => {
  for (const model of ["kimi-for-coding", "k3", "k3.1-pro", "kimi-k2.6", "kimi-k3", "kimi-k2.7-code"]) {
    const body = await sentBody(model, "disabled", "_default");
    assert.ok(!Object.hasOwn(body, "temperature"), model);
    assert.ok(!Object.hasOwn(body, "top_p"), model);
    assert.equal(body.max_completion_tokens, 16384, model);
  }
  const other = await sentBody("moonshot-v1-8k", "disabled", "_default");
  assert.ok(!Object.hasOwn(other, "temperature"));
  assert.ok(!Object.hasOwn(other, "max_completion_tokens"));
});

function textProbe() {
  const f = probe();
  const calls = [];
  f.ctx.helpers.translation = {
    buildMessages: (input) => {
      calls.push(["buildMessages", input]);
      return [{ role: "user", content: "translate" }];
    },
    parseResult: (text, input) => {
      calls.push(["parseResult", text, input]);
      return { items: [{ id: "a", text }] };
    },
  };
  f.ctx.helpers.textTasks = {
    buildMessages: (task, input) => {
      calls.push(["buildMessages", task, input]);
      return [{ role: "user", content: task }];
    },
    parseResult: (task, text, input) => {
      calls.push(["parseResult", task, text, input]);
      return { task, text };
    },
  };
  return { ...f, calls };
}

test("complete translation, dictionary and subtitle results go through the SDK parsers", async () => {
  const config = { baseUrl: "https://api.kimi.com/coding/v1", model: "kimi-for-coding", thinkingMode: "disabled" };
  const translateInput = { items: [{ id: "a", text: "Hello" }], targetLanguage: "zh-CN" };
  let f = textProbe();
  assert.deepEqual(plain(await kimi.translate(translateInput, config, f.ctx)), {
    items: [{ id: "a", text: "recognized\nsecond line" }],
  });
  assert.deepEqual(f.calls.map(([name]) => name), ["buildMessages", "parseResult"]);
  assert.equal(f.calls[1][2], translateInput);
  assert.deepEqual(plain(f.built[0].thinking), { type: "disabled" });

  for (const task of ["dictionary", "segmentSubtitle"]) {
    f = textProbe();
    const input = { text: "bank", items: [{ id: "0", text: "Hi", start: 0, end: 1 }] };
    assert.deepEqual(plain(await kimi[task](input, config, f.ctx)), { task, text: "recognized\nsecond line" });
    assert.deepEqual(f.calls.map((call) => call.slice(0, 2)), [["buildMessages", task], ["parseResult", task]]);
    assert.equal(f.requests.length, 1);
  }
});

function streamProbe(events) {
  const f = textProbe();
  const emitted = [], pushed = [];
  f.ctx.options.streaming = true;
  f.ctx.emit = async (event) => { emitted.push(plain(event)); };
  f.ctx.http.stream = async function* (request) {
    f.requests.push(request);
    yield { type: "headers", status: 200, headers: {} };
    for (const event of events) yield { type: "sse", event: "message", data: JSON.stringify(event) };
  };
  f.ctx.helpers.openai.chatCompletions.createStreamParser = () => ({
    push: (data) => [JSON.parse(data)],
    finish: () => ({ text: "完成", reasoning: "想" }),
  });
  f.ctx.helpers.translation.createStreamParser = async (input) => ({
    push: (text) => { pushed.push(text); return [{ type: "item.delta", id: input.items[0].id, text }]; },
    finish: () => ({ items: [{ id: input.items[0].id, text: pushed.join("") }] }),
  });
  return { ...f, emitted, pushed };
}

test("streaming translation uses only content deltas, never reasoning", async () => {
  const f = streamProbe([
    { type: "reasoning.delta", text: "先分析句子结构。" },
    { type: "text.delta", text: "你" },
    { type: "text.delta", text: "好" },
  ]);
  const input = { items: [{ id: "a", text: "Hello" }], targetLanguage: "zh-CN" };
  const result = await kimi.translate(input, { baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k2.6" }, f.ctx);
  assert.deepEqual(plain(result), { items: [{ id: "a", text: "你好" }] });
  assert.deepEqual(f.pushed, ["你", "好"]);
  assert.deepEqual(f.emitted, [
    { type: "item.delta", id: "a", text: "你" },
    { type: "item.delta", id: "a", text: "好" },
  ]);
  assert.equal(f.built[0].stream, true);
  assert.ok(!f.calls.some(([name]) => name === "parseResult"));
});

test("streaming chat forwards reasoning and content events in order", async () => {
  const events = [
    { type: "reasoning.delta", text: "想" },
    { type: "text.delta", text: "完成" },
  ];
  const f = streamProbe(events);
  const result = await kimi.chat(
    { messages: [{ role: "user", content: "Hi" }] },
    { baseUrl: "https://api.kimi.com/coding/v1", model: "k3", thinkingMode: "enabled", thinkingEffort: "low" },
    f.ctx,
  );
  assert.deepEqual(plain(result), { text: "完成", reasoning: "想" });
  assert.deepEqual(f.emitted, events);
  assert.deepEqual(plain(f.built[0].thinking), { type: "enabled" });
  assert.equal(f.built[0].reasoning_effort, "low");
});

test("subtitle segmentation rejects streaming and incomplete configuration fails before any request", async () => {
  const f = streamProbe([]);
  await assert.rejects(
    kimi.segmentSubtitle({ items: [{ id: "0", text: "Hi", start: 0, end: 1 }] }, { baseUrl: "https://api.kimi.com/coding/v1", model: "k3" }, f.ctx),
    /complete response/,
  );
  for (const config of [{ baseUrl: "https://api.kimi.com/coding/v1" }, { model: "k3" }]) {
    const g = probe();
    await assert.rejects(kimi.chat({ messages: [{ role: "user", content: "Hi" }] }, config, g.ctx), /请配置模型/);
    assert.equal(g.built.length + g.requests.length, 0);
  }
  assert.equal(f.requests.length, 0);
});
