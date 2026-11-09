(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    Object.assign(root.__SA_BOT_MAIN_V1__, api);
    const mark = Symbol.for("kda-model-interceptor-v1");
    if (!root[mark]) root[mark] = api.installModelInterceptor(root);
  }
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  const CHANNEL = "sa-design-bootstrap-v1";
  const MODELS_PATH = "/spacemap/data/Models.steam.json";

  function modelRequestUrl(input, base) {
    try {
      const raw = typeof input === "string" || input instanceof URL ? input : input && input.url;
      const url = new URL(raw, base);
      return url.protocol === "https:" && url.hostname === "unsmod.eu" && url.pathname === MODELS_PATH;
    } catch (_) {
      return false;
    }
  }

  function installModelInterceptor(windowRef, options = {}) {
    if (!windowRef || typeof windowRef.fetch !== "function" ||
        typeof windowRef.addEventListener !== "function") {
      return { cleanup() { return false; } };
    }
    const nativeFetch = windowRef.fetch;
    const waitMs = Number.isFinite(options.configWaitMs) && options.configWaitMs >= 0
      ? options.configWaitMs : 1500;
    let active = true;
    let configReceived = false;
    let shipDesign = "default";
    let resolveConfig;
    const configReady = new Promise((resolve) => { resolveConfig = resolve; });

    function onMessage(event) {
      const data = event && event.data;
      if (event.source !== windowRef || !data || data.channel !== CHANNEL ||
          (data.shipDesign !== "default" && data.shipDesign !== "bastion") ||
          Object.keys(data).length !== 2) return;
      shipDesign = data.shipDesign;
      configReceived = true;
      resolveConfig();
    }

    function cleanup() {
      if (!active) return false;
      active = false;
      windowRef.removeEventListener("message", onMessage);
      if (windowRef.fetch === interceptedFetch) windowRef.fetch = nativeFetch;
      return true;
    }

    async function waitForConfig() {
      if (configReceived || waitMs === 0) return;
      await Promise.race([
        configReady,
        new Promise((resolve) => {
          const schedule = typeof windowRef.setTimeout === "function" ? windowRef.setTimeout.bind(windowRef) : setTimeout;
          schedule(resolve, waitMs);
        })
      ]);
    }

    async function interceptedFetch(...args) {
      if (!modelRequestUrl(args[0], windowRef.location && windowRef.location.href)) {
        return Reflect.apply(nativeFetch, this, args);
      }
      const responsePromise = Reflect.apply(nativeFetch, this, args);
      await waitForConfig();
      const response = await responsePromise;
      cleanup();
      if (shipDesign !== "bastion") return response;
      try {
        const data = await response.clone().json();
        const bastion = data && data.ships && data.ships[2];
        const surgeon = data && data.ships && data.ships[31];
        if (!bastion || !surgeon || typeof bastion.path !== "string" || typeof surgeon.path !== "string") {
          return response;
        }
        surgeon.path = bastion.path;
        const HeadersCtor = windowRef.Headers || Headers;
        const headers = new HeadersCtor(response.headers);
        headers.delete("content-length");
        headers.delete("content-encoding");
        const ResponseCtor = windowRef.Response || Response;
        return new ResponseCtor(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      } catch (_) {
        return response;
      }
    }

    windowRef.addEventListener("message", onMessage);
    windowRef.fetch = interceptedFetch;
    return { cleanup };
  }

  return { installModelInterceptor, modelRequestUrl };
});
