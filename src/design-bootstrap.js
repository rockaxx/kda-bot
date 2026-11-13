(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && typeof chrome === "object" && chrome.runtime?.getURL) {
    root.__SA_BOT_ISOLATED_V1__.designCatalogReady = api.publishDesignBootstrap({
      windowRef: root,
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

  async function publishDesignBootstrap({ windowRef, runtimeGetUrl, fetchFn } = {}) {
    if (!windowRef || typeof windowRef.postMessage !== "function" ||
        typeof runtimeGetUrl !== "function" || typeof fetchFn !== "function") return null;
    try {
      const response = await fetchFn(runtimeGetUrl("assets/Models.steam.json"));
      if (!response?.ok || typeof response.json !== "function") return null;
      const models = await response.json();
      if (!validModels(models)) return null;
      windowRef.postMessage({ channel: "sa-design-bootstrap-v1", models }, "*");
      return models.ships;
    } catch (_) {
      return null;
    }
  }

  return { publishDesignBootstrap };
});
