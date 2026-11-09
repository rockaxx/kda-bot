(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_MAIN_V1__, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  const RANK_ASSET_ROOT = "https://unsmod.eu/spacemap/ui/rank";

  function validRankId(value) {
    return Number.isInteger(value) && value >= 0 && value <= 20;
  }

  function rankAssetUrl(rankId) {
    return validRankId(rankId) && rankId > 0
      ? `${RANK_ASSET_ROOT}/${rankId}/0.png`
      : null;
  }

  function rankWrapperFromRoots(roots) {
    try {
      const ship = roots && roots.user && roots.user.ship;
      const rankLogo = ship && ship.rankLogo;
      return rankLogo && (rankLogo.wrapper || (rankLogo.renderer && rankLogo.renderer.wrapper) || rankLogo);
    } catch (_) {
      return null;
    }
  }

  function project(wrapper) {
    try {
      let point = null;
      if (wrapper && typeof wrapper.toGlobal === "function") point = wrapper.toGlobal({ x: 0, y: 0 });
      else if (wrapper && typeof wrapper.getGlobalPosition === "function") point = wrapper.getGlobalPosition();
      else if (wrapper && wrapper.worldTransform) {
        point = { x: wrapper.worldTransform.tx, y: wrapper.worldTransform.ty };
      }
      return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
    } catch (_) {
      return null;
    }
  }

  function createRankOverride({ windowRef, documentRef, getRoots } = {}) {
    if (!windowRef || !documentRef || typeof documentRef.createElement !== "function" ||
        typeof getRoots !== "function") {
      return { setRank() { return false; }, cleanup() { return false; } };
    }

    const image = documentRef.createElement("img");
    Object.assign(image.style, {
      display: "none",
      left: "0px",
      pointerEvents: "none",
      position: "fixed",
      top: "0px",
      transform: "translate(-50%, -50%)",
      zIndex: "2147483646"
    });
    image.alt = "";
    image.setAttribute?.("aria-hidden", "true");

    let rankId = 0;
    let loaded = false;
    let failed = false;
    let frameId = null;
    let hiddenWrapper = null;
    let hiddenWrapperVisible = true;
    let stopped = false;

    const requestFrame = typeof windowRef.requestAnimationFrame === "function"
      ? (fn) => windowRef.requestAnimationFrame(fn)
      : (fn) => windowRef.setTimeout(fn, 16);
    const cancelFrame = typeof windowRef.cancelAnimationFrame === "function"
      ? (id) => windowRef.cancelAnimationFrame(id)
      : (id) => windowRef.clearTimeout(id);

    function restoreNative() {
      if (hiddenWrapper) {
        try { hiddenWrapper.visible = hiddenWrapperVisible; } catch (_) { /* stale PIXI object */ }
      }
      hiddenWrapper = null;
      image.style.display = "none";
    }

    function connectImage() {
      if (!image.isConnected && documentRef.body && typeof documentRef.body.appendChild === "function") {
        documentRef.body.appendChild(image);
      }
    }

    function schedule() {
      if (!stopped && rankId > 0 && frameId === null) frameId = requestFrame(render);
    }

    function render() {
      frameId = null;
      if (stopped || rankId === 0) return restoreNative();
      connectImage();
      const wrapper = rankWrapperFromRoots(getRoots());
      const point = loaded && !failed ? project(wrapper) : null;
      if (!wrapper || !point) {
        restoreNative();
        schedule();
        return;
      }
      if (hiddenWrapper !== wrapper) {
        restoreNative();
        hiddenWrapper = wrapper;
        hiddenWrapperVisible = wrapper.visible;
      }
      try { wrapper.visible = false; } catch (_) { restoreNative(); schedule(); return; }
      image.style.left = `${point.x}px`;
      image.style.top = `${point.y}px`;
      image.style.display = "block";
      schedule();
    }

    image.onload = () => {
      loaded = true;
      failed = false;
      schedule();
    };
    image.onerror = () => {
      loaded = false;
      failed = true;
      restoreNative();
    };

    function setRank(value) {
      if (stopped || !validRankId(value)) return false;
      rankId = value;
      loaded = false;
      failed = false;
      restoreNative();
      if (frameId !== null) cancelFrame(frameId);
      frameId = null;
      const url = rankAssetUrl(value);
      if (!url) {
        image.remove?.();
        return true;
      }
      connectImage();
      image.src = url;
      schedule();
      return true;
    }

    function cleanup() {
      if (stopped) return false;
      stopped = true;
      if (frameId !== null) cancelFrame(frameId);
      frameId = null;
      restoreNative();
      image.onload = null;
      image.onerror = null;
      image.remove?.();
      return true;
    }

    return { setRank, cleanup };
  }

  return { createRankOverride, rankAssetUrl };
});
