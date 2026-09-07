"use strict";

if (!Object.prototype.hasOwnProperty.call(window, "__SA_BOT_ISOLATED_V1__")) {
  Object.defineProperty(window, "__SA_BOT_ISOLATED_V1__", {
    value: Object.create(null),
    configurable: false,
    enumerable: false,
    writable: false
  });
}

(function mountBootstrapStatus(documentRef) {
  if (!documentRef || typeof documentRef.createElement !== "function") return;
  const id = "sa-bot-bootstrap-status";
  function mount() {
    let status = typeof documentRef.getElementById === "function"
      ? documentRef.getElementById(id)
      : null;
    if (!status) {
      status = documentRef.createElement("div");
      status.id = id;
      status.textContent = "KDA loading…";
      status.style.cssText = "position:fixed;z-index:2147483647;right:16px;top:16px;padding:10px 14px;border:1px solid #e11d48;border-radius:10px;background:#18050b;color:#ffe4e6;font:700 12px Segoe UI,Arial,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.65)";
    }
    const parent = documentRef.documentElement || documentRef.body;
    if (parent && !status.isConnected) parent.appendChild(status);
  }
  mount();
  if (!documentRef.documentElement && typeof documentRef.addEventListener === "function") {
    documentRef.addEventListener("DOMContentLoaded", mount, { once: true });
  }
})(typeof document === "object" ? document : null);
