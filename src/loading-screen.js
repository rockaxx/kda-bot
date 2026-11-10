(function expose(root, factory) {
  const dependency = typeof module === "object" && module.exports
    ? require("./loading-image-settings.js")
    : root?.__SA_BOT_ISOLATED_V1__;
  const api = factory(dependency);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (!root || typeof document !== "object" || typeof chrome !== "object" ||
      !chrome.runtime || typeof chrome.runtime.getURL !== "function") return;
  const mark = Symbol.for("kda-loading-screen-v1");
  if (!root[mark]) {
    root[mark] = api.installLoadingScreen({
      documentRef: document,
      windowRef: root,
      storage: chrome.storage?.local,
      assetUrl: chrome.runtime.getURL("assets/besto.gif"),
      Observer: MutationObserver
    });
  }
})(typeof window === "object" ? window : null, function createApi(dependency) {
  "use strict";

  dependency = dependency || {};

  const PROPERTIES = ["background-image", "background-size", "background-repeat", "background-position", "background-color"];

  function installLoadingScreen({ documentRef, windowRef, storage, assetUrl, Observer } = {}) {
    if (!documentRef || !windowRef || typeof assetUrl !== "string" || !assetUrl || typeof Observer !== "function") {
      return { destroy() { return false; } };
    }
    let stopped = false;
    let styledBody = null;
    let observer = null;
    let currentAssetUrl = assetUrl;

    function clear() {
      const style = styledBody?.style;
      if (style && typeof style.removeProperty === "function") {
        for (const name of PROPERTIES) style.removeProperty(name);
      }
      styledBody = null;
    }

    function stopTracking() {
      observer?.disconnect?.();
      windowRef.removeEventListener?.("message", handleMessage);
    }

    function setImportant(style, name, value) {
      if (!style || typeof style.setProperty !== "function") return;
      if (typeof style.getPropertyValue === "function" && style.getPropertyValue(name) === value &&
          style.getPropertyPriority(name) === "important") return;
      style.setProperty(name, value, "important");
    }

    function update() {
      if (stopped) return;
      const body = documentRef.body;
      if (!body?.style) return;
      if (styledBody && styledBody !== body) clear();
      styledBody = body;
      setImportant(body.style, "background-image", `url("${currentAssetUrl}")`);
      setImportant(body.style, "background-size", "cover");
      setImportant(body.style, "background-repeat", "no-repeat");
      setImportant(body.style, "background-position", "center");
      setImportant(body.style, "background-color", "black");
    }

    function handleMessage(event) {
      const data = event?.data;
      if (event?.source !== windowRef || data?.channel !== "sa-ckda-v1" ||
          data?.direction !== "snapshot" || data?.payload?.connectionState !== "connected" ||
          !Number.isInteger(data?.payload?.mapId) || data.payload.mapId < 1) return;
      const body = documentRef.body;
      if (body?.style) {
        if (styledBody && styledBody !== body) clear();
        styledBody = body;
        setImportant(body.style, "background-image", "none");
        for (const name of ["background-size", "background-repeat", "background-position"]) {
          body.style.removeProperty?.(name);
        }
        setImportant(body.style, "background-color", "black");
      }
      documentRef.documentElement?.setAttribute?.("data-kda-loading-ready", "true");
      stopped = true;
      stopTracking();
    }

    observer = new Observer(update);
    windowRef.addEventListener?.("message", handleMessage);
    update();
    if (!stopped && documentRef.documentElement && typeof observer.observe === "function") {
      observer.observe(documentRef.documentElement, {
        childList: true, subtree: true, attributes: true, attributeFilter: ["style"]
      });
    }
    try {
      storage?.get?.(["loadingScreenImage"], (stored = {}) => {
        if (stopped || typeof dependency.normalizeLoadingImage !== "function") return;
        const normalized = dependency.normalizeLoadingImage(stored.loadingScreenImage);
        if (!normalized.ok || !normalized.value) return;
        currentAssetUrl = normalized.value.dataUrl;
        update();
      });
    } catch (_) { /* Default Besto remains active. */ }

    return {
      destroy() {
        if (stopped) return false;
        stopped = true;
        clear();
        documentRef.documentElement?.removeAttribute?.("data-kda-loading-ready");
        stopTracking();
        return true;
      }
    };
  }

  return { installLoadingScreen };
});
