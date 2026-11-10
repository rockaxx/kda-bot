(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_MAIN_V1__, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  function validRankId(value) {
    return Number.isInteger(value) && value >= 0 && value <= 20;
  }

  const SHIP_MODEL_IDS = Object.freeze({
    default: null, enforcer: 1, bastion: 2, goliath: 14, veteran: 17,
    exalted: 18, goal: 19, kick: 20, referee: 21, surgeon: 31,
    vanquisher: 78, sovereign: 79, peacemaker: 80, saturn: 81,
    bronze: 91, silver: 92, gold: 93, crimson: 95, frost: 128,
    ignite: 133, "plus-carbonite": 181, iron: 216, regalia: 218
  });

  function createRankOverride({ windowRef, getRoots } = {}) {
    if (!windowRef || typeof getRoots !== "function") {
      return { setRank() { return false; }, cleanup() { return false; } };
    }
    const requestFrame = typeof windowRef.requestAnimationFrame === "function"
      ? (fn) => windowRef.requestAnimationFrame(fn)
      : (fn) => windowRef.setTimeout(fn, 16);
    const cancelFrame = typeof windowRef.cancelAnimationFrame === "function"
      ? (id) => windowRef.cancelAnimationFrame(id)
      : (id) => windowRef.clearTimeout(id);
    let selectedRank = 0;
    let activeShip = null;
    let nativeRank = null;
    let frameId = null;
    let stopped = false;

    function currentShip() {
      try {
        const ship = getRoots()?.user?.ship;
        return ship && typeof ship.setRank === "function" ? ship : null;
      } catch (_) { return null; }
    }

    function restoreShip() {
      if (activeShip && validRankId(nativeRank)) {
        try { activeShip.setRank(nativeRank); } catch (_) { /* stale game object */ }
      }
      activeShip = null;
      nativeRank = null;
    }

    function apply() {
      if (stopped || selectedRank === 0) return;
      const ship = currentShip();
      if (!ship) return;
      if (ship !== activeShip) {
        restoreShip();
        activeShip = ship;
        nativeRank = validRankId(ship.rank) ? ship.rank : 0;
      } else if (validRankId(ship.rank) && ship.rank !== selectedRank) {
        nativeRank = ship.rank;
      }
      if (ship.rank !== selectedRank) {
        try { ship.setRank(selectedRank); } catch (_) { /* retry next frame */ }
      }
    }

    function schedule() {
      if (!stopped && selectedRank > 0 && frameId === null) frameId = requestFrame(monitor);
    }

    function monitor() {
      frameId = null;
      if (stopped || selectedRank === 0) return;
      apply();
      schedule();
    }

    function setRank(value) {
      if (stopped || !validRankId(value)) return false;
      if (frameId !== null) cancelFrame(frameId);
      frameId = null;
      if (value === 0) {
        selectedRank = 0;
        restoreShip();
        return true;
      }
      selectedRank = value;
      apply();
      schedule();
      return true;
    }

    function cleanup() {
      if (stopped) return false;
      stopped = true;
      if (frameId !== null) cancelFrame(frameId);
      frameId = null;
      restoreShip();
      return true;
    }

    return { setRank, cleanup };
  }

  function createShipOverride({ windowRef, getRoots } = {}) {
    if (!windowRef || typeof getRoots !== "function") {
      return { setDesign() { return false; }, cleanup() { return false; } };
    }
    const requestFrame = typeof windowRef.requestAnimationFrame === "function"
      ? (fn) => windowRef.requestAnimationFrame(fn)
      : (fn) => windowRef.setTimeout(fn, 16);
    const cancelFrame = typeof windowRef.cancelAnimationFrame === "function"
      ? (id) => windowRef.cancelAnimationFrame(id)
      : (id) => windowRef.clearTimeout(id);
    let selectedDesign = "default";
    let activeShip = null;
    let nativeModelId = null;
    let frameId = null;
    let stopped = false;

    function currentShip() {
      try {
        const ship = getRoots()?.user?.ship;
        return ship && Number.isInteger(ship.modelId) && typeof ship.setShipSprite === "function"
          ? ship
          : null;
      } catch (_) { return null; }
    }

    function restoreShip() {
      if (activeShip && Number.isInteger(nativeModelId)) {
        try {
          activeShip.modelId = nativeModelId;
          activeShip.setShipSprite();
        } catch (_) { /* stale game object */ }
      }
      activeShip = null;
      nativeModelId = null;
    }

    function apply(captureNativeUpdate = true) {
      if (stopped || selectedDesign === "default") return;
      const ship = currentShip();
      if (!ship) return;
      const targetModelId = SHIP_MODEL_IDS[selectedDesign];
      if (ship !== activeShip) {
        restoreShip();
        activeShip = ship;
        nativeModelId = ship.modelId;
      } else if (captureNativeUpdate && ship.modelId !== targetModelId) {
        nativeModelId = ship.modelId;
      }
      if (ship.modelId === targetModelId) return;
      const before = ship.modelId;
      try {
        ship.modelId = targetModelId;
        ship.setShipSprite();
      } catch (_) {
        ship.modelId = before;
      }
    }

    function schedule() {
      if (!stopped && selectedDesign !== "default" && frameId === null) {
        frameId = requestFrame(monitor);
      }
    }

    function monitor() {
      frameId = null;
      if (stopped || selectedDesign === "default") return;
      apply();
      schedule();
    }

    function setDesign(value) {
      if (stopped || !Object.hasOwn(SHIP_MODEL_IDS, value)) return false;
      if (frameId !== null) cancelFrame(frameId);
      frameId = null;
      if (value === "default") {
        selectedDesign = value;
        restoreShip();
        return true;
      }
      selectedDesign = value;
      apply(false);
      schedule();
      return true;
    }

    function cleanup() {
      if (stopped) return false;
      stopped = true;
      if (frameId !== null) cancelFrame(frameId);
      frameId = null;
      restoreShip();
      return true;
    }

    return { setDesign, cleanup };
  }

  return { SHIP_MODEL_IDS, createRankOverride, createShipOverride };
});
