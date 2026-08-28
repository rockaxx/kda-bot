(function expose(root, factory) {
  const dependency =
    typeof module === "object" && module.exports
      ? require("./source-patch.js")
      : root.SABot;
  const api = factory(root, dependency);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.SABot, api);
})(typeof window === "object" ? window : null, function createApi(root, sourcePatch) {
  "use strict";

  function createPatchedBlobConstructor(NativeBlob, patcher, onStatus) {
    return new Proxy(NativeBlob, {
      construct(target, args, newTarget) {
        const parts = args[0];
        const options = args[1];
        const isJavaScript =
          Array.isArray(parts) &&
          parts.length === 1 &&
          typeof parts[0] === "string" &&
          options &&
          options.type === "application/javascript";

        if (!isJavaScript) return Reflect.construct(target, args, newTarget);

        const result = patcher(parts[0]);
        onStatus(result);
        const nextParts = result.status === "patched" ? [result.source] : parts;
        return Reflect.construct(target, [nextParts, options], newTarget);
      }
    });
  }

  function install() {
    if (!root || typeof root.Blob !== "function") return;
    let patchStatus = { status: "waiting", version: null, reason: "waiting" };
    const NativeBlob = root.Blob;
    root.Blob = createPatchedBlobConstructor(
      NativeBlob,
      sourcePatch.patchGameSource,
      (status) => {
        patchStatus = status;
      }
    );

    const startedAt = Date.now();
    let sent = false;
    function sendDiagnostic() {
      if (sent) return;
      const roots = root.__SA_BOT_ROOTS__;
      const timedOut = Date.now() - startedAt >= 30000;
      if (!roots && !timedOut) {
        root.setTimeout(sendDiagnostic, 100);
        return;
      }
      sent = true;
      const summaries = {};
      if (roots) {
        for (const name of ["input", "ui", "user", "camera", "world", "renderer"]) {
          try {
            summaries[name] = sourcePatch.summarizeRoot(roots[name]);
          } catch (_) {
            summaries[name] = "[unavailable]";
          }
        }
      }
      root.postMessage(
        {
          channel: "sa-bot-v1",
          direction: "diagnostic",
          payload: {
            clientVersion: roots ? roots.version : patchStatus.version,
            patchStatus: roots ? "patched" : patchStatus.status,
            reason: roots ? "recognized-client" : patchStatus.reason || "timeout",
            pathname: root.location ? root.location.pathname : "",
            roots: summaries
          }
        },
        "*"
      );
    }

    if (root.document && root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", sendDiagnostic, {
        once: true
      });
    } else {
      sendDiagnostic();
    }
  }

  install();
  return { createPatchedBlobConstructor };
});
