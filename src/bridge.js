(function expose(root, factory) {
  const dependency =
    typeof module === "object" && module.exports
      ? require("./schemas.js")
      : root.__SA_BOT_ISOLATED_V1__;
  const api = factory(dependency);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_ISOLATED_V1__, api);
})(typeof window === "object" ? window : null, function createApi(schemas) {
  "use strict";

  const MAX_DIAGNOSTIC_BYTES = 200 * 1024;

  function isPlainJson(value, seen = new WeakSet()) {
    if (value === null) return true;
    if (["string", "boolean"].includes(typeof value)) return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "object") return false;
    if (seen.has(value)) return false;
    seen.add(value);
    if (Array.isArray(value)) return value.every((item) => isPlainJson(item, seen));
    if (!schemas.isPlainObject(value)) return false;
    return Object.keys(value).every((key) => isPlainJson(value[key], seen));
  }

  function serializedSize(value) {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  }

  function createBridge({ windowRef, onSnapshot, onDiagnostic }) {
    let listening = false;

    function handleMessage(event) {
      if (event.source !== windowRef) return;
      const envelope = event.data;
      if (!schemas.isPlainObject(envelope) || envelope.channel !== schemas.CHANNEL) return;

      if (envelope.direction === "snapshot") {
        const result = schemas.validateEnvelope(envelope, "snapshot");
        if (result.ok) onSnapshot(result.value.payload);
        return;
      }
      if (envelope.direction !== "diagnostic" || !isPlainJson(envelope.payload)) return;
      if (serializedSize(envelope.payload) > MAX_DIAGNOSTIC_BYTES) return;
      onDiagnostic(JSON.parse(JSON.stringify(envelope.payload)));
    }

    function start() {
      if (listening) return;
      listening = true;
      windowRef.addEventListener("message", handleMessage);
    }

    function stop() {
      if (!listening) return;
      listening = false;
      windowRef.removeEventListener("message", handleMessage);
    }

    return { start, stop };
  }

  return { createBridge, MAX_DIAGNOSTIC_BYTES };
});
