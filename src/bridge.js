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
  const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
  const ACTION_TYPES = new Set([
    "arm",
    "disarm",
    "selectNpc",
    "moveTo",
    "pressAmmoKey",
    "cancelMovement",
    "clearTarget"
  ]);

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

  function createBridge({
    windowRef,
    onSnapshot,
    onDiagnostic,
    onSource = () => {},
    onActionResult = () => {}
  }) {
    let listening = false;
    let nextRequestId = 1;

    function handleMessage(event) {
      if (event.source !== windowRef) return;
      const envelope = event.data;
      if (!schemas.isPlainObject(envelope) || envelope.channel !== schemas.CHANNEL) return;

      if (envelope.direction === "snapshot") {
        const result = schemas.validateEnvelope(envelope, "snapshot");
        if (result.ok) onSnapshot(result.value.payload);
        return;
      }
      if (envelope.direction === "source") {
        const payload = envelope.payload;
        if (
          !schemas.isPlainObject(payload) ||
          typeof payload.reason !== "string" ||
          typeof payload.source !== "string" ||
          payload.source.length === 0 ||
          serializedSize(payload) > MAX_SOURCE_BYTES
        ) return;
        onSource({ reason: payload.reason, source: payload.source });
        return;
      }
      if (envelope.direction === "action-result") {
        const payload = envelope.payload;
        if (
          !schemas.isPlainObject(payload) ||
          !Number.isInteger(payload.requestId) ||
          payload.requestId < 1 ||
          !ACTION_TYPES.has(payload.type) ||
          typeof payload.ok !== "boolean" ||
          typeof payload.reason !== "string" ||
          payload.reason.length > 100
        ) return;
        onActionResult({
          requestId: payload.requestId,
          type: payload.type,
          ok: payload.ok,
          reason: payload.reason
        });
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

    function sendAction(action) {
      if (!schemas.isPlainObject(action) || !ACTION_TYPES.has(action.type)) {
        throw new TypeError("invalid bot action");
      }
      const payload = { requestId: nextRequestId++, ...action };
      windowRef.postMessage({
        channel: schemas.CHANNEL,
        direction: "action",
        payload
      }, "*");
      return payload.requestId;
    }

    return { sendAction, start, stop };
  }

  return { createBridge, MAX_DIAGNOSTIC_BYTES, MAX_SOURCE_BYTES };
});
