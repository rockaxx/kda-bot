(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_ISOLATED_V1__, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  const DESIGN_DEFAULT_SETTINGS = Object.freeze({ rankId: 0, shipDesign: "default" });

  function normalizeDesignSettings(value = {}) {
    const source = value && typeof value === "object" ? value : {};
    const output = { ...DESIGN_DEFAULT_SETTINGS };
    const errors = [];
    if (Object.prototype.hasOwnProperty.call(source, "rankId")) {
      if (Number.isInteger(source.rankId) && source.rankId >= 0 && source.rankId <= 20) {
        output.rankId = source.rankId;
      } else {
        errors.push("rankId must be an integer from 0 to 20");
      }
    }
    if (Object.prototype.hasOwnProperty.call(source, "shipDesign")) {
      if (source.shipDesign === "default" || source.shipDesign === "bastion") {
        output.shipDesign = source.shipDesign;
      } else {
        errors.push("shipDesign must be default or bastion");
      }
    }
    return {
      ok: errors.length === 0,
      errors,
      value: Object.freeze(output)
    };
  }

  return { DESIGN_DEFAULT_SETTINGS, normalizeDesignSettings };
});
