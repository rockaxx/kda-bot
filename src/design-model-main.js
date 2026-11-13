(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    Object.assign(root.__SA_BOT_MAIN_V1__, api);
    const mark = Symbol.for("kda-model-interceptor-v1");
    if (!root[mark]) root[mark] = api.installModelInterceptor(root);
    root.__SA_BOT_MAIN_V1__.hasDesignModel = root[mark].hasModel;
  }
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  const CHANNEL = "sa-design-bootstrap-v1";
  const MODEL_PATHS = new Set([
    "/spacemap/data/Models.steam.json",
    "/client/data/Models.steam.json"
  ]);

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function validModels(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value) &&
      value.ships && typeof value.ships === "object" && value.ships[2] && value.ships[31] &&
      typeof value.ships[2].path === "string" && typeof value.ships[31].path === "string");
  }

  function modelRequestUrl(input, base) {
    try {
      const raw = typeof input === "string" || input instanceof URL ? input : input?.url;
      const url = new URL(raw, base);
      const allowedHost = url.hostname === "unsmod.eu" || url.hostname === "steam.space-aces.com";
      return url.protocol === "https:" && allowedHost && MODEL_PATHS.has(url.pathname);
    } catch (_) { return false; }
  }

  function installModelInterceptor(windowRef, options = {}) {
    if (!windowRef || typeof windowRef.fetch !== "function" || typeof windowRef.addEventListener !== "function") {
      return { cleanup() { return false; }, hasModel() { return false; } };
    }
    const nativeFetch = windowRef.fetch;
    const waitMs = Number.isFinite(options.configWaitMs) && options.configWaitMs >= 0 ? options.configWaitMs : 1500;
    let active = true;
    let packagedModels = null;
    let modelsServed = false;
    let configReceived = false;
    let resolveConfig;
    const configReady = new Promise((resolve) => { resolveConfig = resolve; });

    function onMessage(event) {
      const data = event?.data;
      if (event.source !== windowRef || !data || data.channel !== CHANNEL ||
          !validModels(data.models) || Object.keys(data).length !== 2 || configReceived) return;
      packagedModels = clone(data.models);
      configReceived = true;
      resolveConfig();
    }

    function cleanup() {
      if (!active) return false;
      active = false;
      windowRef.removeEventListener("message", onMessage);
      if (windowRef.fetch === interceptedFetch) windowRef.fetch = nativeFetch;
      packagedModels = null;
      return true;
    }

    async function waitForConfig() {
      if (configReceived || waitMs === 0) return;
      await Promise.race([configReady, new Promise((resolve) => {
        const schedule = typeof windowRef.setTimeout === "function" ? windowRef.setTimeout.bind(windowRef) : setTimeout;
        schedule(resolve, waitMs);
      })]);
    }

    async function interceptedFetch(...args) {
      if (!modelRequestUrl(args[0], windowRef.location?.href)) return Reflect.apply(nativeFetch, this, args);
      await waitForConfig();
      if (!packagedModels) return Reflect.apply(nativeFetch, this, args);
      const ResponseCtor = windowRef.Response || Response;
      const response = new ResponseCtor(JSON.stringify(packagedModels), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
      modelsServed = true;
      return response;
    }

    windowRef.addEventListener("message", onMessage);
    windowRef.fetch = interceptedFetch;
    return {
      cleanup,
      hasModel(id) {
        if (!active) return false;
        // ZIP-based game mods can supply the catalog without making a fetch.
        const loadedShips = windowRef.Models?.ships;
        const ships = loadedShips || (modelsServed ? packagedModels?.ships : null);
        return typeof ships?.[id]?.path === "string";
      }
    };
  }

  return { installModelInterceptor, modelRequestUrl };
});
