// Standalone syntax checks: publishing never loads or executes host code.
function validRuleUrlPath(path) {
  if (typeof path !== "string") return false;
  try {
    const decoded = decodeURIComponent(path);
    return (
      !path.startsWith("/") &&
      path === path.trim() &&
      !path.includes(":") &&
      ![path, decoded].some((value) =>
        Array.from(value).some(
          (char) =>
            char === "\\" ||
            char.charCodeAt(0) < 32 ||
            char.charCodeAt(0) === 127,
        ),
      ) &&
      !decoded.split(/[/?#]/).includes("..")
    );
  } catch {
    return false;
  }
}
module.exports = function validateRules(rules, fields) {
  const fail = (valid, message) => {
    if (!valid)
      throw Object.assign(new Error(message), { code: "INVALID_PACKAGE" });
  };
  const object = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const unsafe = new Set(["__proto__", "prototype", "constructor"]);
  const path = (value, roots) =>
    typeof value === "string" &&
    /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[\d+\])+$/.test(value) &&
    roots.includes(value.split(/[.[]/)[0]) &&
    !value
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .some((key) => unsafe.has(key));
  const secret = (key) =>
    fields.some(
      (field) =>
        field.key === key && (field.isSecret || field.type === "password"),
    );
  const nonsecret = (value) =>
    !value.startsWith("config.") || !secret(value.slice(7).split(/[.[]/)[0]);
  function node(value, mode, depth = 0) {
    fail(depth <= 32, "Rule nesting limit exceeded");
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value))
      return value.forEach((item) => node(item, mode, depth + 1));
    const keys = Object.keys(value);
    if (Object.hasOwn(value, "$ref")) {
      const roots =
        mode === "response"
          ? ["response"]
          : mode === "http"
            ? ["input", "config", "resources"]
            : ["input", "config"];
      fail(
        path(value.$ref, roots) &&
          keys.every((key) =>
            [
              "$ref",
              "fallbackRef",
              "omitIfEmpty",
              "omitValues",
              "transform",
            ].includes(key),
          ),
        "Invalid field reference",
      );
      fail(nonsecret(value.$ref), "Secrets require $secret references");
      if (Object.hasOwn(value, "fallbackRef"))
        fail(
          mode !== "response" &&
            path(value.$ref, ["input", "config"]) &&
            path(value.fallbackRef, ["input", "config"]) &&
            nonsecret(value.fallbackRef),
          "Invalid fallback reference",
        );
      fail(
        value.omitIfEmpty === undefined ||
          typeof value.omitIfEmpty === "boolean",
        "Invalid omission flag",
      );
      fail(
        value.omitValues === undefined || Array.isArray(value.omitValues),
        "Invalid omission values",
      );
      fail(
        value.transform === undefined ||
          value.transform === "languages.toIso6391",
        "Unsupported transform",
      );
      return;
    }
    if (Object.hasOwn(value, "$if")) {
      const condition = value.$if;
      fail(
        mode === "protocol" &&
          object(condition) &&
          keys.every((key) => ["$if", "then", "else"].includes(key)) &&
          Object.keys(condition).every((key) =>
            ["$ref", "equals"].includes(key),
          ),
        "Invalid condition",
      );
      const field = fields.find(
        (field) => `config.${field.key}` === condition.$ref,
      );
      fail(
        field &&
          !secret(field.key) &&
          (Object.hasOwn(condition, "equals")
            ? field.type === "select" &&
              (field.options || []).some(
                (option) => option.value === condition.equals,
              )
            : field.type === "boolean"),
        "Invalid condition setting",
      );
      fail(
        Object.hasOwn(value, "then") || Object.hasOwn(value, "else"),
        "Missing condition branch",
      );
      for (const branch of ["then", "else"])
        if (Object.hasOwn(value, branch)) node(value[branch], mode, depth + 1);
      return;
    }
    if (mode === "http" && Object.hasOwn(value, "$secret")) {
      fail(
        keys.length === 1 && secret(value.$secret),
        "Invalid secret reference",
      );
      return;
    }
    if (mode === "http" && Object.hasOwn(value, "$asset")) {
      fail(
        keys.length === 1 && path(value.$asset, ["input"]),
        "Invalid asset reference",
      );
      return;
    }
    if (mode === "http" && Object.hasOwn(value, "$url")) {
      const url = value.$url;
      fail(
        keys.length === 1 &&
          object(url) &&
          Object.keys(url).every((key) => ["base", "path"].includes(key)) &&
          path(url.base, ["config"]) &&
          nonsecret(url.base) &&
          validRuleUrlPath(url.path),
        "Invalid URL rule",
      );
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      fail(
        !unsafe.has(key) && !key.startsWith("$") && key !== "fallbackRef",
        "Unknown or unsafe operator",
      );
      node(item, mode, depth + 1);
    }
  }
  for (const rule of Object.values(rules.handlers)) {
    fail(object(rule), "Invalid handler");
    if (rules.format === "http") {
      fail(
        object(rule.request) && ["json", "asset"].includes(rule.response?.kind),
        "Invalid HTTP rule",
      );
      node(rule.request, "http");
      node(rule.response.map, "response");
    } else {
      fail(object(rule.request), "Invalid protocol request");
      node(rule.request.baseUrl, "protocol");
      node(rule.request.model, "protocol");
      fail(
        rule.request.auth?.type === "bearer" &&
          object(rule.request.auth.secret) &&
          Object.keys(rule.request.auth.secret).length === 1 &&
          secret(rule.request.auth.secret.$secret),
        "Invalid protocol auth",
      );
      node(rule.request.parameters, "protocol");
    }
  }
};
