(function expose(root, factory) {
  const dependency =
    typeof module === "object" && module.exports
      ? require("./ckda-schema.js")
      : root.__SA_BOT_ISOLATED_V1__;
  const api = factory(dependency);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_ISOLATED_V1__, api);
})(typeof window === "object" ? window : null, function createApi(dependency) {
  "use strict";

  const MAX_CKDA_PAYLOAD_BYTES = dependency.CKDA_MAX_ENVELOPE_BYTES;
  const COMMAND_TYPES = new Set(dependency.CKDA_COMMAND_TYPES);

  function serializedSize(value) {
    try {
      return new TextEncoder().encode(JSON.stringify(value)).byteLength;
    } catch (_) {
      return Infinity;
    }
  }

  function createCkdaBridge({ windowRef, onSnapshot = () => {}, onResult = () => {} }) {
    if (!windowRef || typeof windowRef.addEventListener !== "function") {
      throw new TypeError("windowRef must support message listeners");
    }

    let nextRequestId = 1;
    let destroyed = false;

    function handleMessage(event) {
      if (!event || event.source !== windowRef) return;
      if (serializedSize(event.data) > MAX_CKDA_PAYLOAD_BYTES) return;
      const result = dependency.validateCkdaEnvelope(event.data);
      if (!result.ok) return;
      if (result.value.direction === "snapshot") {
        onSnapshot(result.value.payload);
      } else if (result.value.direction === "result") {
        onResult(result.value.payload);
      }
    }

    windowRef.addEventListener("message", handleMessage);

    function sendCommand(type, payload = {}) {
      if (!COMMAND_TYPES.has(type)) throw new TypeError("invalid C-KDA command");
      if (!dependency.isPlainObject(payload)) {
        throw new TypeError("invalid C-KDA payload");
      }
      if (serializedSize(payload) > MAX_CKDA_PAYLOAD_BYTES) {
        throw new RangeError("C-KDA payload exceeds 4096 bytes");
      }
      const requestId = nextRequestId++;
      windowRef.postMessage({
        channel: dependency.CKDA_CHANNEL,
        direction: "command",
        payload: { ...payload, requestId, type }
      }, "*");
      return requestId;
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      windowRef.removeEventListener("message", handleMessage);
    }

    return { sendCommand, destroy };
  }

  return { createCkdaBridge, MAX_CKDA_PAYLOAD_BYTES };
});
