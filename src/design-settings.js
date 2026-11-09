(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_ISOLATED_V1__, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  const DESIGN_DEFAULT_SETTINGS = Object.freeze({ rankId: 0 });

  function normalizeDesignSettings(value = {}) {
    const rankId = value && value.rankId;
    if (!Number.isInteger(rankId) || rankId < 0 || rankId > 20) {
      return {
        ok: false,
        errors: ["rankId must be an integer from 0 to 20"],
        value: DESIGN_DEFAULT_SETTINGS
      };
    }
    return {
      ok: true,
      errors: [],
      value: Object.freeze({ rankId })
    };
  }

  return { DESIGN_DEFAULT_SETTINGS, normalizeDesignSettings };
});
