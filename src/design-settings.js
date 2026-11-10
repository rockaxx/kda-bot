(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_ISOLATED_V1__, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  const SHIP_DESIGN_OPTIONS = Object.freeze([
    ["default", "Current ship design", null],
    ["enforcer", "Goliath Enforcer", 1],
    ["bastion", "Goliath Bastion", 2],
    ["goliath", "Goliath", 14],
    ["veteran", "Goliath Veteran", 17],
    ["exalted", "Goliath Exalted", 18],
    ["goal", "Goliath Goal", 19],
    ["kick", "Goliath Kick", 20],
    ["referee", "Goliath Referee", 21],
    ["surgeon", "Goliath Surgeon", 31],
    ["vanquisher", "Goliath Vanquisher", 78],
    ["sovereign", "Goliath Sovereign", 79],
    ["peacemaker", "Goliath Peacemaker", 80],
    ["saturn", "Goliath Saturn", 81],
    ["bronze", "Goliath Bronze", 91],
    ["silver", "Goliath Silver", 92],
    ["gold", "Goliath Gold", 93],
    ["crimson", "Goliath Crimson", 95],
    ["frost", "Goliath Frost", 128],
    ["ignite", "Goliath Ignite", 133],
    ["plus-carbonite", "Goliath Plus Carbonite", 181],
    ["iron", "Goliath Iron", 216],
    ["regalia", "Goliath Regalia", 218]
  ].map(Object.freeze));
  const SHIP_DESIGN_NAMES = new Set(SHIP_DESIGN_OPTIONS.map(([name]) => name));
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
      if (SHIP_DESIGN_NAMES.has(source.shipDesign)) {
        output.shipDesign = source.shipDesign;
      } else {
        errors.push("shipDesign is invalid");
      }
    }
    return {
      ok: errors.length === 0,
      errors,
      value: Object.freeze(output)
    };
  }

  return { DESIGN_DEFAULT_SETTINGS, SHIP_DESIGN_OPTIONS, normalizeDesignSettings };
});
