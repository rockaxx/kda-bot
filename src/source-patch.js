(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_MAIN_V1__, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  const CLIENT_VERSION = "1.9.0.045";
  const BUILD_MARKER_PATTERN =
    /const\s+[_$A-Za-z][_$A-Za-z0-9]*\s*=\s*(['"])(\d+\.\d+\.\d+\.\d+)\1\s*;/g;
  const REQUIRED_ROOT_MARKERS = Object.freeze([
    "_0x429744['mapId']",
    "_0x22a0bf['ship']",
    "_0x607b9['gamepadTargeter']",
    "_0x229c50['initListeners']"
  ]);
  const SENSITIVE_KEY =
    /token|cookie|session|auth|password|email|chat|message|payload|socket|credential/i;

  function unsupported(source, reason) {
    return { status: "unsupported", source, version: null, reason };
  }

  function patchGameSource(source) {
    if (typeof source !== "string") return unsupported(source, "not-text");
    const buildMarkers = [...source.matchAll(BUILD_MARKER_PATTERN)];
    if (buildMarkers.length !== 1) {
      return unsupported(source, "version-marker-mismatch");
    }
    if (!REQUIRED_ROOT_MARKERS.every((marker) => source.includes(marker))) {
      return unsupported(source, "root-fingerprint-mismatch");
    }

    const version = buildMarkers[0][2];
    const exposure =
      'if(!Object.prototype.hasOwnProperty.call(window,"__SA_BOT_ROOTS__")){' +
      'Object.defineProperty(window,"__SA_BOT_ROOTS__",{configurable:true,value:Object.freeze({' +
      `version:"${version}",` +
      'get input(){return _0x229c50;},' +
      'get ui(){return _0x594165;},' +
      'get user(){return _0x22a0bf;},' +
      'get camera(){return _0x1ceb4c;},' +
      'get world(){return _0x429744;},' +
      'get renderer(){return _0x607b9;}' +
      '})});}';
    return {
      status: "patched",
      source:
        source.slice(0, buildMarkers[0].index + buildMarkers[0][0].length) +
        exposure +
        source.slice(buildMarkers[0].index + buildMarkers[0][0].length),
      version,
      reason: "recognized-client"
    };
  }

  function summarizeRoot(value, options) {
    const config = options || {};
    const maxDepth = Number.isInteger(config.maxDepth) ? config.maxDepth : 2;
    const maxKeys = Number.isInteger(config.maxKeys) ? config.maxKeys : 100;
    const seen = new WeakSet();
    let keyCount = 0;

    function visit(current, depth) {
      if (typeof current === "function") return "[function]";
      if (current === null || typeof current !== "object") return current;
      if (depth > maxDepth) return "[depth-limit]";
      if (seen.has(current)) return "[circular]";
      seen.add(current);

      const output = Array.isArray(current) ? [] : {};
      let keys;
      try {
        keys = Object.keys(current);
      } catch (_) {
        return "[unavailable]";
      }
      for (const key of keys) {
        if (keyCount >= maxKeys) break;
        if (SENSITIVE_KEY.test(key)) continue;
        keyCount += 1;
        try {
          output[key] = visit(current[key], depth + 1);
        } catch (_) {
          output[key] = "[unavailable]";
        }
      }
      return output;
    }

    return visit(value, 0);
  }

  return { CLIENT_VERSION, patchGameSource, summarizeRoot };
});
