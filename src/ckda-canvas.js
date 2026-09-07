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

    const markerSize = clamp(size, 3, 30);
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
    Object.assign(canvas.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: "2147483647"
    });
    documentRef.body.append(canvas);
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
        documentRef.body &&
        typeof documentRef.body.append === "function"
      ) {
        documentRef.body.append(canvas);
      }
      return canvas.isConnected !== false;
    }

    function viewport() {
      const width = Number.isFinite(windowRef.innerWidth) && windowRef.innerWidth >= 0
        ? windowRef.innerWidth : 0;
      const height = Number.isFinite(windowRef.innerHeight) && windowRef.innerHeight >= 0
        ? windowRef.innerHeight : 0;
      const ratio = Number.isFinite(windowRef.devicePixelRatio) && windowRef.devicePixelRatio > 0
        ? windowRef.devicePixelRatio : 1;
      return { width, height, ratio };
    }

    function resize() {
      const { width, height, ratio } = viewport();
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const backingWidth = Math.floor(width * ratio);
      const backingHeight = Math.floor(height * ratio);
      if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        canvas.width = backingWidth;
        canvas.height = backingHeight;
      }
      if (context && typeof context.setTransform === "function") {
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
      return { width, height };
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
        return;
      }

      const players = dependency.filterVisiblePlayers(
        Array.from(observations.values()),
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
