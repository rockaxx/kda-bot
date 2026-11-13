(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_MAIN_V1__, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  function validRankId(value) {
    return Number.isInteger(value) && value >= 0 && value <= 20;
  }

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

  function createShipOverride({ windowRef, getRoots, hasModel = () => false } = {}) {
    if (!windowRef || typeof getRoots !== "function") {
      return { setDesign() { return false; }, cleanup() { return false; } };
    }
    const requestFrame = typeof windowRef.requestAnimationFrame === "function"
      ? (fn) => windowRef.requestAnimationFrame(fn)
      : (fn) => windowRef.setTimeout(fn, 16);
    const cancelFrame = typeof windowRef.cancelAnimationFrame === "function"
      ? (id) => windowRef.cancelAnimationFrame(id)
      : (id) => windowRef.clearTimeout(id);
    let selectedModelId = null;
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
      if (stopped || selectedModelId === null || !hasModel(selectedModelId)) return;
      const ship = currentShip();
      if (!ship) return;
      const targetModelId = selectedModelId;
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
      if (!stopped && selectedModelId !== null && frameId === null) {
        frameId = requestFrame(monitor);
      }
    }

    function monitor() {
      frameId = null;
      if (stopped || selectedModelId === null) return;
      apply();
      schedule();
    }

    function setDesign(value) {
      if (stopped || (value !== "default" && (typeof value !== "string" || !/^model:[1-9]\d{0,8}$/.test(value)))) return false;
      if (frameId !== null) cancelFrame(frameId);
      frameId = null;
      selectedModelId = value === "default" ? null : Number(value.slice(6));
      if (value === "default") {
        restoreShip();
        return true;
      }
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

  function createRingOverride(getRoots) {
    let ringLevel = 0;
    let active = null;

    function restore() {
      const previous = active;
      active = null;
      if (!previous?.applied || previous.ship.rings !== previous.applied ||
          previous.ship.ringInfo?.wrapper?.destroyed) return;
      previous.ship.setRings(previous.original);
      previous.ship.positionBottomBarElements();
    }

    function refresh() {
      if (ringLevel === 0) return;
      const ship = getRoots()?.user?.ship;
      if (active && active.ship !== ship) restore();
      const ringInfo = ship?.ringInfo;
      if (!Array.isArray(ship?.rings) || typeof ship.setRings !== "function" ||
          typeof ship.positionBottomBarElements !== "function" ||
          typeof ringInfo?.reinit !== "function" || ringInfo.wrapper?.destroyed) return;

      if (!active || ship.rings !== active.applied) {
        active = { ship, original: JSON.stringify(ship.rings) };
      } else if (active.level === ringLevel && active.ringInfo === ringInfo) {
        return;
      }
      // The native renderer uses six ring slots and draws a crown when all seven are filled.
      const rings = Array.from({ length: 7 }, (_, slot) => slot < ringLevel ? 1 : 0);
      const before = ship.rings;
      try {
        ship.setRings(JSON.stringify(rings));
      } catch (error) {
        ship.rings = before;
        throw error;
      }
      active.applied = ship.rings;
      ship.positionBottomBarElements();
      active.level = ringLevel;
      active.ringInfo = ringInfo;
    }

    function setRings(level) {
      ringLevel = level;
      if (level === 0) restore();
      else refresh();
    }

    return { setRings, refresh, cleanup: () => setRings(0) };
  }

  function createTitleOverride(getRoots) {
    let selectedText = "";
    let selectedColor = "";
    let nativeValues = null;

    function restore() {
      if (!nativeValues) return;
      const { ship, tag, fields } = nativeValues;
      nativeValues = null;
      for (const field of fields) {
        // Preserve updates already made by the game since our last refresh.
        if (Object.is(field.target[field.key], field.applied)) field.target[field.key] = field.original;
      }
      if (ship.titleTagObj === tag) ship.positionBottomBarElements?.();
    }

    function refresh() {
      if (!selectedText) return;
      const ship = getRoots()?.user?.ship;
      const tag = ship?.titleTagObj;
      if (nativeValues && (ship !== nativeValues.ship || tag !== nativeValues.tag ||
          tag.style !== nativeValues.style)) restore();
      if (typeof tag?.text !== "string" || !tag.style ||
          typeof ship.currentTitleColor !== "string" || typeof ship.positionBottomBarElements !== "function") return;
      if (!nativeValues) {
        const properties = [[tag, "text"], [tag.style, "fill"], [tag, "safilter"], [ship, "currentTitleColor"]];
        nativeValues = {
          ship, tag, style: tag.style,
          fields: properties.map(([target, key]) => ({ target, key, original: target[key], applied: target[key] }))
        };
      }
      // PIXI takes a numeric fill. The canvas renderer reads the ship's CSS colour.
      const values = [selectedText, Number.parseInt(selectedColor.slice(1), 16), null, selectedColor];
      let changed = false;
      nativeValues.fields.forEach((field, index) => {
        const current = field.target[field.key];
        if (!Object.is(current, field.applied)) field.original = current;
        if (!Object.is(current, values[index])) {
          field.target[field.key] = values[index];
          changed = true;
        }
        field.applied = field.target[field.key];
      });
      if (changed) ship.positionBottomBarElements();
    }

    function setTitle(text, color) {
      selectedText = text.trim();
      selectedColor = color;
      if (selectedText) refresh();
      else restore();
    }

    function cleanup() {
      selectedText = "";
      restore();
    }

    return { setTitle, refresh, cleanup };
  }

  return { createRankOverride, createRingOverride, createShipOverride, createTitleOverride };
});
