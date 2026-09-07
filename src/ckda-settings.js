(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_ISOLATED_V1__, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  const CKDA_DEFAULT_SETTINGS = Object.freeze({
    overlayEnabled: true,
    displayMode: "masked-only",
    shape: "circle",
    allyColor: "#45d483",
    enemyColor: "#ff394f",
    sizePx: 8,
    opacity: 0.9,
    showEmpCooldown: true,
    showIshCooldown: true,
    empCooldownMs: 28000,
    ishCooldownMs: 28000,
    premiumOverride: false
  });

  const DISPLAY_MODES = new Set(["masked-only", "all"]);
  const SHAPES = new Set(["circle", "square", "triangle", "plus", "star"]);
  const COLOR = /^#[0-9a-f]{6}$/i;
  const BOOLEAN_KEYS = new Set([
    "overlayEnabled",
    "showEmpCooldown",
    "showIshCooldown",
    "premiumOverride"
  ]);
  const RANGES = Object.freeze({
    sizePx: [3, 200],
    opacity: [0.1, 1],
    empCooldownMs: [1000, 120000],
    ishCooldownMs: [1000, 120000]
  });

  function inRange(value, minimum, maximum) {
    return Number.isFinite(value) && value >= minimum && value <= maximum;
  }

  function normalizeCkdaSettings(input = {}) {
    const source =
      input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const normalized = {};
    const errors = [];

    for (const key of Object.keys(CKDA_DEFAULT_SETTINGS)) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        normalized[key] = CKDA_DEFAULT_SETTINGS[key];
        continue;
      }

      const value = source[key];
      let valid = false;
      let error = "";
      if (BOOLEAN_KEYS.has(key)) {
        valid = typeof value === "boolean";
        error = `${key} must be a boolean`;
      } else if (key === "displayMode") {
        valid = DISPLAY_MODES.has(value);
        error = "displayMode is invalid";
      } else if (key === "shape") {
        valid = SHAPES.has(value);
        error = "shape is invalid";
      } else if (key === "allyColor" || key === "enemyColor") {
        valid = typeof value === "string" && COLOR.test(value);
        error = `${key} is invalid`;
      } else {
        const [minimum, maximum] = RANGES[key];
        valid = inRange(value, minimum, maximum);
        error = `${key} must be from ${minimum} to ${maximum}`;
      }

      normalized[key] = valid ? value : CKDA_DEFAULT_SETTINGS[key];
      if (!valid) errors.push(error);
    }

    return {
      ok: errors.length === 0,
      value: Object.freeze(normalized),
      errors
    };
  }

  return { CKDA_DEFAULT_SETTINGS, normalizeCkdaSettings };
});
