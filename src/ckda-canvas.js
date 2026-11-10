(function expose(root, factory) {
  const dependency =
    typeof module === "object" && module.exports
      ? {
          ...require("./ckda-schema.js"),
          ...require("./ckda-core.js"),
          ...require("./ckda-settings.js")
        }
      : root.__SA_BOT_ISOLATED_V1__;
  const api = factory(dependency);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_ISOLATED_V1__, api);
})(typeof window === "object" ? window : null, function createApi(dependency) {
  "use strict";

  const CANVAS_ID = "sa-ckda-marker-layer";
  const STALE_AFTER_MS = 750;
  const SHAPES = new Set(["circle", "square", "triangle", "plus", "star"]);

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function drawMarker(context, shape, x, y, size, color, opacity) {
    if (
      !context ||
      !SHAPES.has(shape) ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(size) ||
      !Number.isFinite(opacity)
    ) {
      return false;
    }

    const markerSize = clamp(size, 3, 200);
    const markerOpacity = clamp(opacity, 0.1, 1);
    context.save();
    context.globalAlpha = markerOpacity;
    context.fillStyle = typeof color === "string" ? color : "#ffffff";
    context.strokeStyle = typeof color === "string" ? color : "#ffffff";
    context.lineWidth = Math.max(1, markerSize / 4);
    context.shadowColor = typeof color === "string" ? color : "#ffffff";
    context.shadowBlur = Math.max(4, markerSize / 2);
    context.beginPath();

    if (shape === "circle") {
      context.arc(x, y, markerSize, 0, Math.PI * 2);
    } else if (shape === "square") {
      context.rect(x - markerSize, y - markerSize, markerSize * 2, markerSize * 2);
    } else if (shape === "triangle") {
      context.moveTo(x, y - markerSize);
      context.lineTo(x + markerSize, y + markerSize);
      context.lineTo(x - markerSize, y + markerSize);
      context.closePath();
    } else if (shape === "plus") {
      context.moveTo(x - markerSize, y);
      context.lineTo(x + markerSize, y);
      context.moveTo(x, y - markerSize);
      context.lineTo(x, y + markerSize);
    } else {
      for (let index = 0; index < 10; index += 1) {
        const radius = index % 2 === 0 ? markerSize : markerSize / 2;
        const angle = -Math.PI / 2 + index * Math.PI / 5;
        const pointX = x + Math.cos(angle) * radius;
        const pointY = y + Math.sin(angle) * radius;
        if (index === 0) context.moveTo(pointX, pointY);
        else context.lineTo(pointX, pointY);
      }
      context.closePath();
    }

    context.fill();
    context.stroke();
    context.restore();
    return true;
  }

  function createCkdaCanvas({ documentRef, windowRef, now }) {
    if (
      !documentRef ||
      !documentRef.body ||
      typeof documentRef.createElement !== "function" ||
      !windowRef ||
      typeof windowRef.requestAnimationFrame !== "function"
    ) {
      throw new TypeError("C-KDA canvas requires document and animation frame");
    }
    const clock = typeof now === "function" ? now :
      dependency.createMonotonicEpochClock(windowRef.performance);

    const canvas = documentRef.createElement("canvas");
    canvas.id = CANVAS_ID;
    const baseStyle = {
      position: "fixed",
      left: "0px",
      top: "0px",
      display: "block",
      visibility: "visible",
      opacity: "1",
      pointerEvents: "none",
      zIndex: "2147483647",
      transform: "translateZ(0)",
      isolation: "isolate"
    };
    Object.assign(canvas.style, baseStyle);
    if (typeof canvas.style.setProperty === "function") {
      for (const [name, value] of Object.entries({
        position: baseStyle.position,
        left: baseStyle.left,
        top: baseStyle.top,
        display: baseStyle.display,
        visibility: baseStyle.visibility,
        opacity: baseStyle.opacity,
        "pointer-events": baseStyle.pointerEvents,
        "z-index": baseStyle.zIndex,
        transform: baseStyle.transform,
        isolation: baseStyle.isolation
      })) canvas.style.setProperty(name, value, "important");
    }
    const overlayParent = documentRef.documentElement || documentRef.body;
    const appendOverlay = () => {
      if (typeof overlayParent.append === "function") overlayParent.append(canvas);
      else overlayParent.appendChild?.(canvas);
    };
    appendOverlay();
    const context = canvas.getContext("2d");
    let latestSnapshot = null;
    let latestSettings = null;
    const observations = new Map();
    let frameId = null;
    let destroyed = false;

    function ensureConnected() {
      if (
        !destroyed &&
        canvas.isConnected === false &&
        overlayParent
      ) {
        appendOverlay();
      }
      return canvas.isConnected !== false;
    }

    function gameCanvas() {
      if (typeof documentRef.getElementsByTagName !== "function") return null;
      let candidates;
      try {
        candidates = Array.from(documentRef.getElementsByTagName("canvas"));
      } catch (_) {
        return null;
      }
      let best = null;
      let bestScore = 0;
      const viewportWidth = Math.max(1, Number(windowRef.innerWidth) || 1);
      const viewportHeight = Math.max(1, Number(windowRef.innerHeight) || 1);
      const viewportAspect = viewportWidth / viewportHeight;
      for (const candidate of candidates) {
        if (
          !candidate ||
          candidate === canvas ||
          candidate.id === CANVAS_ID ||
          candidate.isConnected === false ||
          typeof candidate.getBoundingClientRect !== "function"
        ) continue;
        try {
          const rect = candidate.getBoundingClientRect();
          const width = Number(rect && rect.width);
          const height = Number(rect && rect.height);
          const area = width * height;
          const aspectDelta = Math.abs(width / height - viewportAspect);
          const gamePriority = candidate.id === "gamemap" ? 1e15 : 0;
          const score = gamePriority + area / (1 + aspectDelta * 10);
          if (Number.isFinite(score) && width > 0 && height > 0 && score > bestScore) {
            best = { candidate, rect, width, height };
            bestScore = score;
          }
        } catch (_) {
          // Ignore transient loading canvases and keep searching.
        }
      }
      return best;
    }

    function viewport() {
      const width = Number.isFinite(windowRef.innerWidth) && windowRef.innerWidth >= 0
        ? windowRef.innerWidth : 0;
      const height = Number.isFinite(windowRef.innerHeight) && windowRef.innerHeight >= 0
        ? windowRef.innerHeight : 0;
      const ratio = Number.isFinite(windowRef.devicePixelRatio) && windowRef.devicePixelRatio > 0
        ? windowRef.devicePixelRatio : 1;
      const game = gameCanvas();
      if (!game) {
        return { left: 0, top: 0, width, height, ratio, sourceWidth: width, sourceHeight: height };
      }
      const sourceWidth = Number(game.candidate.width);
      const sourceHeight = Number(game.candidate.height);
      return {
        left: Number.isFinite(game.rect.left) ? game.rect.left : 0,
        top: Number.isFinite(game.rect.top) ? game.rect.top : 0,
        width: game.width,
        height: game.height,
        ratio,
        sourceWidth: Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : game.width,
        sourceHeight: Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight : game.height
      };
    }

    function resize() {
      const surface = viewport();
      const { left, top, width, height, ratio } = surface;
      canvas.style.left = `${left}px`;
      canvas.style.top = `${top}px`;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      if (typeof canvas.style.setProperty === "function") {
        canvas.style.setProperty("left", `${left}px`, "important");
        canvas.style.setProperty("top", `${top}px`, "important");
        canvas.style.setProperty("width", `${width}px`, "important");
        canvas.style.setProperty("height", `${height}px`, "important");
      }
      const backingWidth = Math.floor(width * ratio);
      const backingHeight = Math.floor(height * ratio);
      if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        canvas.width = backingWidth;
        canvas.height = backingHeight;
      }
      if (context && typeof context.setTransform === "function") {
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
      return surface;
    }

    function erase(viewportSize = resize()) {
      if (context && typeof context.clearRect === "function") {
        context.clearRect(0, 0, viewportSize.width, viewportSize.height);
      }
    }

    function drawCooldown(player, settings, now) {
      if (!context || typeof context.fillText !== "function") return;
      const values = [];
      if (settings.showEmpCooldown && Number.isFinite(player.empEndsAt) && player.empEndsAt > now) {
        values.push(`EMP ${Math.ceil((player.empEndsAt - now) / 1000)}`);
      }
      if (settings.showIshCooldown && Number.isFinite(player.ishEndsAt) && player.ishEndsAt > now) {
        values.push(`ISH ${Math.ceil((player.ishEndsAt - now) / 1000)}`);
      }
      if (!values.length) return;
      const markerSize = clamp(settings.sizePx, 3, 30);
      context.save();
      context.globalAlpha = clamp(settings.opacity, 0.1, 1);
      context.fillStyle = player.relation === "ally" ? settings.allyColor : settings.enemyColor;
      context.font = `${Math.max(10, markerSize + 2)}px sans-serif`;
      values.forEach((value, index) => {
        context.fillText(value, player.screenX + markerSize + 2, player.screenY - markerSize + 2 + index * (markerSize + 2));
      });
      context.restore();
    }

    function currentTime() {
      try {
        const value = clock();
        return Number.isFinite(value) && value >= 0 ? value : null;
      } catch (_) {
        return null;
      }
    }

    function draw() {
      if (!ensureConnected()) return;
      const viewportSize = resize();
      erase(viewportSize);
      const timestamp = currentTime();
      for (const [id, player] of observations) {
        if (timestamp === null || player.observedAt > timestamp ||
            timestamp - player.observedAt > STALE_AFTER_MS) observations.delete(id);
      }
      if (
        !context ||
        !latestSnapshot ||
        !latestSettings ||
        latestSettings.overlayEnabled !== true ||
        latestSnapshot.connectionState !== "connected" ||
        timestamp === null ||
        latestSnapshot.timestamp > timestamp ||
        timestamp - latestSnapshot.timestamp > STALE_AFTER_MS
      ) {
        if (canvas.dataset) {
          canvas.dataset.ckdaRender = JSON.stringify({
            reason: !context ? "no-context" : !latestSnapshot ? "no-snapshot" :
              !latestSettings ? "no-settings" : latestSettings.overlayEnabled !== true ? "overlay-disabled" :
              latestSnapshot.connectionState !== "connected" ? "disconnected" :
              timestamp === null ? "clock" : "stale-snapshot",
            tracked: observations.size
          });
        }
        return;
      }

      // MAIN publishes canvas-local CSS pixels. Offscreen coordinates must stay
      // offscreen; inferring their units from their position creates ghost markers.
      const projectedPlayers = Array.from(observations.values());
      const players = dependency.filterVisiblePlayers(
        projectedPlayers,
        latestSettings,
        timestamp,
        viewportSize,
        STALE_AFTER_MS
      );
      for (const player of players) {
        const color = player.relation === "ally"
          ? latestSettings.allyColor : latestSettings.enemyColor;
        drawMarker(
          context,
          latestSettings.shape,
          player.screenX,
          player.screenY,
          latestSettings.sizePx,
          color,
          latestSettings.opacity
        );
        drawCooldown(player, latestSettings, timestamp);
      }
      if (canvas.dataset) {
        canvas.dataset.ckdaRender = JSON.stringify({
          reason: players.length ? "drawn" : "filtered",
          tracked: observations.size,
          drawn: players.length,
          mode: latestSettings.displayMode,
          raw: Array.from(observations.values()).slice(0, 4).map(player => [
            player.id, player.screenX, player.screenY, player.cloaked, timestamp - player.observedAt
          ]),
          projected: projectedPlayers.slice(0, 4).map(player => [player.screenX, player.screenY]),
          surface: [viewportSize.width, viewportSize.height, viewportSize.sourceWidth, viewportSize.sourceHeight]
        });
      }
    }

    function schedule() {
      if (destroyed || frameId !== null) return;
      frameId = windowRef.requestAnimationFrame(() => {
        frameId = null;
        draw();
        schedule();
      });
    }

    function render(snapshot, settings) {
      if (destroyed) return false;
      const checkedSnapshot = dependency.validateCkdaSnapshot(snapshot);
      const checkedSettings = dependency.normalizeCkdaSettings(settings);
      if (!checkedSnapshot.ok || !checkedSettings.ok) {
        clear();
        return false;
      }
      const next = checkedSnapshot.value;
      if (!latestSnapshot || latestSnapshot.mapId !== next.mapId ||
          next.connectionState !== "connected") {
        observations.clear();
        latestSnapshot = null;
      }
      if (next.connectionState === "connected") {
        for (const player of next.players) {
          const previous = observations.get(player.id);
          if (!previous || previous.observedAt <= player.observedAt) observations.set(player.id, player);
        }
      }
      if (!latestSnapshot || latestSnapshot.timestamp <= next.timestamp) latestSnapshot = next;
      latestSettings = checkedSettings.value;
      schedule();
      return true;
    }

    function clear() {
      latestSnapshot = null;
      latestSettings = null;
      observations.clear();
      erase();
    }

    function handleResize() {
      erase();
    }

    windowRef.addEventListener?.("resize", handleResize);
    schedule();

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      clear();
      if (frameId !== null) windowRef.cancelAnimationFrame?.(frameId);
      frameId = null;
      windowRef.removeEventListener?.("resize", handleResize);
      canvas.remove();
    }

    return { render, clear, destroy };
  }

  return { CANVAS_ID, drawMarker, createCkdaCanvas };
});
