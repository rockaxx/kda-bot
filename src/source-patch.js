(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_MAIN_V1__, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  const CLIENT_VERSION = "1.9.0.049";
  const BUILD_MARKER_PATTERN =
    /const\s+[_$A-Za-z][_$A-Za-z0-9]*\s*=\s*(['"])(\d+\.\d+\.\d+\.\d+)\1\s*;/g;
  const CLIENT_FINGERPRINTS = Object.freeze([
    Object.freeze({
      markers: Object.freeze([
        "_0x8541dd['mapId']",
        "_0x3d592['ship']",
        "_0x5d1a8d['gamepadTargeter']",
        "_0xc13e48['initListeners']",
        "_0x1e1267['followX']",
        "_0x313249['handleWriteLog']"
      ]),
      roots: Object.freeze({
        input: "_0xc13e48",
        ui: "_0x313249",
        user: "_0x3d592",
        camera: "_0x1e1267",
        world: "_0x8541dd",
        renderer: "_0x5d1a8d"
      })
    }),
    Object.freeze({
      markers: Object.freeze([
        "_0x429744['mapId']",
        "_0x22a0bf['ship']",
        "_0x607b9['gamepadTargeter']",
        "_0x229c50['initListeners']"
      ]),
      roots: Object.freeze({
        input: "_0x229c50",
        ui: "_0x594165",
        user: "_0x22a0bf",
        camera: "_0x1ceb4c",
        world: "_0x429744",
        renderer: "_0x607b9"
      })
    })
  ]);
  const SENSITIVE_KEY =
    /token|cookie|session|auth|password|email|chat|message|payload|socket|credential/i;

  function unsupported(source, reason) {
    return { status: "unsupported", source, version: null, reason };
  }

  function patchGameSource(source) {
    if (typeof source !== "string") return unsupported(source, "not-text");
    const fingerprint = CLIENT_FINGERPRINTS.find(({ markers }) =>
      markers.every((marker) => source.includes(marker))
    );
    if (!fingerprint) {
      return unsupported(source, "root-fingerprint-mismatch");
    }
    const buildMarkers = [...source.matchAll(BUILD_MARKER_PATTERN)];
    if (buildMarkers.length > 1) {
      return unsupported(source, "version-marker-ambiguous");
    }

    const version = buildMarkers.length === 1 ? buildMarkers[0][2] : null;
    const versionExpression = version
      ? `"${version}"`
      : 'String(window.FETCH_V||window.WORKER_V||"unknown")';
    const exposure =
      'if(!Object.prototype.hasOwnProperty.call(window,"__SA_BOT_ROOTS__")){' +
      'Object.defineProperty(window,"__SA_BOT_ROOTS__",{configurable:true,value:Object.freeze({' +
      `version:${versionExpression},` +
      `get input(){return ${fingerprint.roots.input};},` +
      `get ui(){return ${fingerprint.roots.ui};},` +
      `get user(){return ${fingerprint.roots.user};},` +
      `get camera(){return ${fingerprint.roots.camera};},` +
      `get world(){return ${fingerprint.roots.world};},` +
      `get renderer(){return ${fingerprint.roots.renderer};}` +
      '})});}';
    const insertionIndex = buildMarkers.length === 1
      ? buildMarkers[0].index + buildMarkers[0][0].length
      : 0;
    return {
      status: "patched",
      source:
        source.slice(0, insertionIndex) +
        exposure +
        source.slice(insertionIndex),
      version,
      reason: version ? "recognized-client" : "recognized-structural-client"
    };
  }

  function summarizeRoot(value, options) {
    const config = options || {};
    const maxDepth = Number.isInteger(config.maxDepth) ? config.maxDepth : 2;
    const maxKeys = Number.isInteger(config.maxKeys) ? config.maxKeys : 100;
    const seen = new WeakSet();
    let keyCount = 0;

    function visit(current, depth) {
      if (current === undefined) return "[undefined]";
      if (typeof current === "function") return "[function]";
      if (typeof current === "bigint") return "[bigint]";
      if (typeof current === "symbol") return "[symbol]";
      if (typeof current === "number" && !Number.isFinite(current)) {
        return "[invalid-number]";
      }
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
