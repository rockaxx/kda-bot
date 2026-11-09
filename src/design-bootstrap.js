(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && typeof chrome === "object" && chrome.storage && chrome.storage.local) {
    api.publishDesignBootstrap({ windowRef: root, storageArea: chrome.storage.local });
  }
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  function publishDesignBootstrap({ windowRef, storageArea } = {}) {
    return new Promise((resolve) => {
      if (!windowRef || typeof windowRef.postMessage !== "function" ||
          !storageArea || typeof storageArea.get !== "function") {
        resolve(false);
        return;
      }
      try {
        storageArea.get(["designSettings"], (stored = {}) => {
          const raw = stored && stored.designSettings && stored.designSettings.shipDesign;
          const shipDesign = raw === "bastion" ? "bastion" : "default";
          windowRef.postMessage({ channel: "sa-design-bootstrap-v1", shipDesign }, "*");
          resolve(true);
        });
      } catch (_) {
        windowRef.postMessage({ channel: "sa-design-bootstrap-v1", shipDesign: "default" }, "*");
        resolve(false);
      }
    });
  }

  return { publishDesignBootstrap };
});
