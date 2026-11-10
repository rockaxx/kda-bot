(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && typeof chrome === "object" && chrome.storage?.local && chrome.runtime?.getURL) {
    api.publishDesignBootstrap({
      windowRef: root,
      storageArea: chrome.storage.local,
      runtimeGetUrl: chrome.runtime.getURL.bind(chrome.runtime),
      fetchFn: root.fetch.bind(root)
    });
  }
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  function validModels(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value) &&
      value.ships && typeof value.ships === "object" && value.ships[2] && value.ships[31]);
  }

  function readStorage(storageArea) {
    return new Promise((resolve, reject) => {
      try { storageArea.get(["designSettings"], resolve); } catch (error) { reject(error); }
    });
  }

  async function publishDesignBootstrap({ windowRef, storageArea, runtimeGetUrl, fetchFn } = {}) {
    if (!windowRef || typeof windowRef.postMessage !== "function" ||
        !storageArea || typeof storageArea.get !== "function" ||
        typeof runtimeGetUrl !== "function" || typeof fetchFn !== "function") return false;
    try {
      const [stored, response] = await Promise.all([
        readStorage(storageArea),
        fetchFn(runtimeGetUrl("assets/Models.steam.json"))
      ]);
      if (!response?.ok || typeof response.json !== "function") return false;
      const models = await response.json();
      if (!validModels(models)) return false;
      const raw = stored?.designSettings?.shipDesign;
      const shipDesign = raw === "bastion" ? "bastion" : "default";
      windowRef.postMessage({ channel: "sa-design-bootstrap-v1", shipDesign, models }, "*");
      return true;
    } catch (_) {
      return false;
    }
  }

  return { publishDesignBootstrap };
});
