(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.SABot, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  const SENSITIVE_KEY =
    /token|cookie|session|auth|password|email|chat|message|payload|socket|credential/i;

  function sanitize(value, seen = new WeakSet()) {
    if (value === null || ["string", "boolean"].includes(typeof value)) return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : "[invalid-number]";
    if (typeof value === "function") return "[function]";
    if (typeof value !== "object") return `[${typeof value}]`;
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    const output = Array.isArray(value) ? [] : {};
    for (const key of Object.keys(value)) {
      if (SENSITIVE_KEY.test(key)) continue;
      try {
        output[key] = sanitize(value[key], seen);
      } catch (_) {
        output[key] = "[unavailable]";
      }
    }
    return output;
  }

  function createLogger(limit = 100, nowIso = () => new Date().toISOString()) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new TypeError("limit must be an integer from 1 to 1000");
    }
    let entries = [];

    function add(type, data) {
      entries.push({ at: nowIso(), type: String(type), data: sanitize(data) });
      if (entries.length > limit) entries = entries.slice(-limit);
    }

    function list() {
      return JSON.parse(JSON.stringify(entries));
    }

    function clear() {
      entries = [];
    }

    return { add, clear, list };
  }

  return { createLogger };
});
