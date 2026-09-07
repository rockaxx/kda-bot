(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_MAIN_V1__, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  const CLIENT_VERSION = "1.9.0.052";
  const BUILD_MARKER_PATTERN =
    /const\s+[_$A-Za-z][_$A-Za-z0-9]*\s*=\s*(['"])(\d+\.\d+\.\d+\.\d+)\1\s*;/g;
  const CLIENT_FINGERPRINTS = Object.freeze([
    Object.freeze({
      version: "1.9.0.052",
      markers: Object.freeze([
        "_0x1bdc1e['mapId']",
        "_0x13411e['ship']",
        "_0x456f25['gamepadTargeter']",
        "_0x29d06a['initListeners']",
        "_0xa7de8f['followX']",
        "_0x3ce5a6['handleWriteLog']",
        "_0x3a7293['initiateConnection']()",
        "['addEmpNew']",
        "'instaShield'",
        "'tshield'",
        "['updatePremium']"
      ]),
      roots: Object.freeze({
        input: "_0x29d06a",
        ui: "_0x3ce5a6",
        user: "_0x13411e",
        network: "_0x3a7293",
        camera: "_0xa7de8f",
        world: "_0x1bdc1e",
        renderer: "_0x456f25"
      })
    }),
    Object.freeze({
      version: "1.9.0.051",
      markers: Object.freeze([
        "_0x27bad5['mapId']",
        "_0x4e6c8d['ship']",
        "_0x4bfb8d['gamepadTargeter']",
        "_0x312959['initListeners']",
        "_0x5608bd['followX']",
        "_0x3154af['handleWriteLog']",
        "_0x1db4fd['initiateConnection']()",
        "['addEmpNew']",
        "'instaShield'",
        "'tshield'",
        "['updatePremium']"
      ]),
      roots: Object.freeze({
        input: "_0x312959",
        ui: "_0x3154af",
        user: "_0x4e6c8d",
        network: "_0x1db4fd",
        camera: "_0x5608bd",
        world: "_0x27bad5",
        renderer: "_0x4bfb8d"
      })
    }),
    Object.freeze({
      version: "1.9.0.049",
      markers: Object.freeze([
        "_0x8541dd['mapId']",
        "_0x3d592['ship']",
        "_0x5d1a8d['gamepadTargeter']",
        "_0xc13e48['initListeners']",
        "_0x1e1267['followX']",
        "_0x313249['handleWriteLog']",
        "_0x2e4b9e['initiateConnection']()"
      ]),
      roots: Object.freeze({
        input: "_0xc13e48",
        ui: "_0x313249",
        user: "_0x3d592",
        network: "_0x2e4b9e",
        camera: "_0x1e1267",
        world: "_0x8541dd",
        renderer: "_0x5d1a8d"
      })
    }),
    Object.freeze({
      version: "1.9.0.045",
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
        network: "null",
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
    const fingerprints = CLIENT_FINGERPRINTS.filter(({ markers }) =>
      markers.every((marker) => source.includes(marker))
    );
    if (fingerprints.length !== 1) {
      return unsupported(source, "root-fingerprint-mismatch");
    }
    const [fingerprint] = fingerprints;
    const buildMarkers = [...source.matchAll(BUILD_MARKER_PATTERN)];
    if (buildMarkers.length > 1) {
      return unsupported(source, "version-marker-ambiguous");
    }

    const version = buildMarkers.length === 1
      ? buildMarkers[0][2]
      : fingerprint.version;
    const versionExpression = `"${version}"`;
    const exposure =
      'if(!Object.prototype.hasOwnProperty.call(window,"__SA_BOT_ROOTS__")){' +
      'Object.defineProperty(window,"__SA_BOT_ROOTS__",{configurable:true,value:Object.freeze({' +
      `version:${versionExpression},` +
      `get input(){return ${fingerprint.roots.input};},` +
      `get ui(){return ${fingerprint.roots.ui};},` +
      `get user(){return ${fingerprint.roots.user};},` +
      `get network(){return ${fingerprint.roots.network};},` +
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
      reason: buildMarkers.length === 1
        ? "recognized-client"
        : "recognized-structural-client"
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
