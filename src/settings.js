(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_ISOLATED_V1__, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    kiteDistance: 700,
    dangerRadius: 550,
    fleeHpPercent: 35,
    resumeHpPercent: 100,
    ammoKey: "1",
    planningIntervalMs: 100,
    movementIntervalMs: 250,
    targetBlacklistMs: 5000
  });

  const RANGES = Object.freeze({
    kiteDistance: [100, 5000],
    dangerRadius: [100, 5000],
    fleeHpPercent: [1, 99],
    resumeHpPercent: [1, 100],
    planningIntervalMs: [50, 1000],
    movementIntervalMs: [100, 2000],
    targetBlacklistMs: [1000, 60000]
  });

  function inRange(value, minimum, maximum) {
    return Number.isFinite(value) && value >= minimum && value <= maximum;
  }

  function normalizeSettings(input = {}) {
    const source =
      input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const value = {};
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      value[key] = Object.prototype.hasOwnProperty.call(source, key)
        ? source[key]
        : DEFAULT_SETTINGS[key];
    }

    const errors = [];
    for (const [key, [minimum, maximum]] of Object.entries(RANGES)) {
      if (!inRange(value[key], minimum, maximum)) {
        errors.push(`${key} must be from ${minimum} to ${maximum}`);
      }
    }

    if (!/^[0-9]$/.test(value.ammoKey)) {
      errors.push("ammoKey must be one digit from 0 to 9");
    }

    const fleeValid = inRange(value.fleeHpPercent, 1, 99);
    const resumeValid = inRange(value.resumeHpPercent, 1, 100);
    if (
      fleeValid &&
      resumeValid &&
      value.resumeHpPercent < value.fleeHpPercent
    ) {
      errors.push("resumeHpPercent must be at least fleeHpPercent");
    }

    return {
      ok: errors.length === 0,
      value: Object.freeze(value),
      errors
    };
  }

  return { DEFAULT_SETTINGS, normalizeSettings };
});
