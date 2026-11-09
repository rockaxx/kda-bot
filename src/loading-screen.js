(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (!root || typeof document !== "object" || typeof chrome !== "object" ||
      !chrome.runtime || typeof chrome.runtime.getURL !== "function") return;
  const mark = Symbol.for("kda-loading-screen-v1");
  if (!root[mark]) {
    root[mark] = api.installLoadingScreen({
      documentRef: document,
      assetUrl: chrome.runtime.getURL("assets/besto.gif"),
      Observer: MutationObserver
    });
  }
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  function installLoadingScreen({ documentRef, assetUrl, Observer } = {}) {
    if (!documentRef || typeof assetUrl !== "string" || !assetUrl || typeof Observer !== "function") {
      return { destroy() { return false; } };
    }
    let stopped = false;

    function setImportant(style, name, value) {
      if (!style || typeof style.setProperty !== "function") return;
      if (typeof style.getPropertyValue === "function" &&
          style.getPropertyValue(name) === value &&
          style.getPropertyPriority(name) === "important") return;
      style.setProperty(name, value, "important");
    }

    function apply() {
      if (stopped) return;
      const style = documentRef.body && documentRef.body.style;
      setImportant(style, "background-image", `url("${assetUrl}")`);
      setImportant(style, "background-size", "cover");
      setImportant(style, "background-repeat", "no-repeat");
      setImportant(style, "background-position", "center");
      setImportant(style, "background-color", "black");
    }

    const observer = new Observer(apply);
    apply();
    if (documentRef.documentElement && typeof observer.observe === "function") {
      observer.observe(documentRef.documentElement, {
        attributes: true,
        attributeFilter: ["style"],
        childList: true,
        subtree: true
      });
    }

    return {
      destroy() {
        if (stopped) return false;
        stopped = true;
        observer.disconnect?.();
        return true;
      }
    };
  }

  return { installLoadingScreen };
});
