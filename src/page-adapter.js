(function expose(root, factory) {
  const dependency =
    typeof module === "object" && module.exports
      ? require("./source-patch.js")
      : root.__SA_BOT_MAIN_V1__;
  const api = factory(root, dependency);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_MAIN_V1__, api);
})(typeof window === "object" ? window : null, function createApi(root, sourcePatch) {
  "use strict";

  function createPatchedBlobConstructor(NativeBlob, patcher, onStatus) {
    return new Proxy(NativeBlob, {
      construct(target, args, newTarget) {
        const parts = args[0];
        const options = args[1];
        const isJavaScript =
          Array.isArray(parts) &&
          parts.length === 1 &&
          typeof parts[0] === "string" &&
          options &&
          options.type === "application/javascript";

        if (!isJavaScript) return Reflect.construct(target, args, newTarget);

        const result = patcher(parts[0]);
        onStatus(result, parts[0]);
        const nextParts = result.status === "patched" ? [result.source] : parts;
        return Reflect.construct(target, [nextParts, options], newTarget);
      }
    });
  }

  function publishDiagnostic(windowRef, diagnostic, clientSource) {
    windowRef.postMessage(
      { channel: "sa-bot-v1", direction: "diagnostic", payload: diagnostic },
      "*"
    );
    if (typeof clientSource === "string" && clientSource.length > 0) {
      windowRef.postMessage(
        {
          channel: "sa-bot-v1",
          direction: "source",
          payload: { reason: diagnostic.reason, source: clientSource }
        },
        "*"
      );
    }
  }

  function percentage(current, maximum) {
    const value = Number(current);
    const max = Number(maximum);
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
      return null;
    }
    return Math.round(Math.max(0, Math.min(100, (value / max) * 100)) * 10) / 10;
  }

  function entityAlive(entity, hpPercent) {
    return entity.destroyed !== true && hpPercent > 0;
  }

  function isIdentifier(value) {
    return (
      (typeof value === "string" && value.length > 0) ||
      (Number.isFinite(value) && Number.isInteger(value))
    );
  }

  function canonicalEntityId(entity) {
    return entity && isIdentifier(entity.ID) ? entity.ID : null;
  }

  function findEntityById(ships, id) {
    if (!ships || typeof ships.get !== "function") return null;
    const direct = ships.get(id);
    if (direct && canonicalEntityId(direct) === id) return direct;
    let found = null;
    if (typeof ships.forEach === "function") {
      ships.forEach((entity) => {
        if (!found && canonicalEntityId(entity) === id) found = entity;
      });
    }
    return found;
  }

  function resolveSafeMovementPoint(
    world,
    start,
    destination,
    sampleStep = 100,
    safetyMargin = 300
  ) {
    if (
      !world ||
      typeof world.checkShipWillHitBarrier !== "function" ||
      !Number.isFinite(start.x) ||
      !Number.isFinite(start.y) ||
      !Number.isFinite(destination.x) ||
      !Number.isFinite(destination.y)
    ) {
      return { status: "unsafe", point: null, reason: "map-boundary-unavailable" };
    }
    const dx = destination.x - start.x;
    const dy = destination.y - start.y;
    const routeLength = Math.hypot(dx, dy);
    if (routeLength === 0) {
      return { status: "safe", point: { ...destination }, reason: "safe-map-route" };
    }
    const steps = Math.max(1, Math.ceil(routeLength / sampleStep));
    try {
      for (let index = 1; index <= steps; index += 1) {
        const distanceAlongRoute = Math.min(routeLength, index * sampleStep);
        const ratio = distanceAlongRoute / routeLength;
        const point = {
          x: start.x + dx * ratio,
          y: start.y + dy * ratio
        };
        if (
          !world.checkShipWillHitBarrier(
            start.x,
            start.y,
            point.x - start.x,
            point.y - start.y
          )
        ) continue;

        const safeDistance = Math.max(
          0,
          distanceAlongRoute - sampleStep - safetyMargin
        );
        if (safeDistance <= 0) {
          return { status: "unsafe", point: null, reason: "map-boundary-too-close" };
        }
        const safeRatio = safeDistance / routeLength;
        return {
          status: "adjusted",
          point: {
            x: start.x + dx * safeRatio,
            y: start.y + dy * safeRatio
          },
          reason: "map-boundary-margin"
        };
      }
    } catch (_) {
      return { status: "unsafe", point: null, reason: "map-boundary-check-failed" };
    }
    return { status: "safe", point: { ...destination }, reason: "safe-map-route" };
  }

  function createSnapshot(roots, timestamp = Date.now()) {
    try {
      const user = roots && roots.user;
      const world = roots && roots.world;
      const ship = user && user.ship;
      const ships = world && world.MAP_SHIPS;
      const mapId = Number(world && world.mapId);
      const playerId = user && user.userID;
      const playerHp = ship && percentage(ship.HP, ship.maxHp && ship.maxHp[ship.config]);
      if (
        !ship ||
        typeof ships.forEach !== "function" ||
        !Number.isInteger(mapId) ||
        mapId < 1 ||
        (!Number.isInteger(playerId) &&
          !(typeof playerId === "string" && playerId.length > 0)) ||
        !Number.isFinite(Number(ship.x)) ||
        !Number.isFinite(Number(ship.y)) ||
        playerHp === null
      ) {
        return null;
      }

      const entities = [];
      ships.forEach((entity, id) => {
        if (!entity || entity.isNpc !== true) return;
        const entityId = canonicalEntityId(entity);
        const hpPercent = percentage(
          entity.HP,
          entity.maxHp && entity.maxHp[entity.config]
        );
        if (
          !isIdentifier(entityId) ||
          !Number.isFinite(Number(entity.x)) ||
          !Number.isFinite(Number(entity.y)) ||
          hpPercent === null
        ) return;
        entities.push({
          id: entityId,
          type: "npc",
          x: Number(entity.x),
          y: Number(entity.y),
          hpPercent,
          alive: entityAlive(entity, hpPercent)
        });
      });

      let target = null;
      if (ship.targetID !== null && ship.targetID !== undefined && ship.targetID !== 0) {
        const targetEntity = findEntityById(ships, ship.targetID);
        if (targetEntity) {
          const targetHp = percentage(
            targetEntity.HP,
            targetEntity.maxHp && targetEntity.maxHp[targetEntity.config]
          );
          target = {
            id: ship.targetID,
            type: targetEntity.isNpc === true ? "npc" : "player",
            alive: targetHp !== null && entityAlive(targetEntity, targetHp)
          };
        } else {
          target = { id: ship.targetID, type: "object", alive: false };
        }
      }

      const speed = ship.speed;
      const moving = Boolean(
        speed &&
        (Number(speed.x) !== 0 || Number(speed.y) !== 0)
      );
      return {
        timestamp,
        clientVersion: String(roots.version || "unknown").replace(/^n/, ""),
        connectionState:
          roots.network && roots.network.connected === true
            ? "connected"
            : "disconnected",
        mapId,
        player: {
          id: playerId,
          x: Number(ship.x),
          y: Number(ship.y),
          hpPercent: playerHp,
          alive: entityAlive(ship, playerHp),
          moving,
          inCombat: ship.isAttacking === true
        },
        target,
        entities
      };
    } catch (_) {
      return null;
    }
  }

  function publishSnapshot(windowRef, snapshot) {
    windowRef.postMessage(
      { channel: "sa-bot-v1", direction: "snapshot", payload: snapshot },
      "*"
    );
  }

  function startSnapshotPublisher(
    windowRef,
    roots,
    intervalMs = 100,
    now = Date.now
  ) {
    const send = () => {
      const snapshot = createSnapshot(roots, now());
      if (snapshot) publishSnapshot(windowRef, snapshot);
    };
    send();
    return windowRef.setInterval(send, intervalMs);
  }

  function createActionExecutor(windowRef, roots) {
    let armed = false;

    function publishResult(payload, ok, reason) {
      windowRef.postMessage({
        channel: "sa-bot-v1",
        direction: "action-result",
        payload: {
          requestId: payload.requestId,
          type: payload.type,
          ok,
          reason
        }
      }, "*");
    }

    function playerShip() {
      const ship = roots && roots.user && roots.user.ship;
      const hp = ship && percentage(
        ship.HP,
        ship.maxHp && ship.maxHp[ship.config]
      );
      return ship && entityAlive(ship, hp) ? ship : null;
    }

    function liveNpc(id) {
      const ships = roots && roots.world && roots.world.MAP_SHIPS;
      const entity = findEntityById(ships, id);
      if (!entity || entity.isNpc !== true) return null;
      const hp = percentage(
        entity.HP,
        entity.maxHp && entity.maxHp[entity.config]
      );
      return entityAlive(entity, hp) ? entity : null;
    }

    function connectionReady() {
      return Boolean(roots && roots.network && roots.network.connected === true);
    }

    function cleanup() {
      const user = roots && roots.user;
      const ship = user && user.ship;
      let ok = true;
      if (user && typeof user.requestTarget === "function") {
        try {
          user.requestTarget(null);
        } catch (_) {
          ok = false;
        }
      }
      if (
        ship &&
        Number.isFinite(Number(ship.x)) &&
        Number.isFinite(Number(ship.y))
      ) {
        if (typeof ship.stopFlying === "function") {
          try {
            ship.stopFlying(false, true);
          } catch (_) {
            ok = false;
          }
        } else {
          ok = false;
        }
        if (user && typeof user.forceMovement === "function") {
          try {
            user.forceMovement(Number(ship.x), Number(ship.y));
          } catch (_) {
            ok = false;
          }
        } else {
          ok = false;
        }
      }
      return ok;
    }

    function disarmNow() {
      if (!armed) return true;
      armed = false;
      return cleanup();
    }

    function handleMessage(event) {
      if (event.source !== windowRef) return;
      const envelope = event.data;
      const payload = envelope && envelope.payload;
      if (
        !envelope ||
        envelope.channel !== "sa-bot-v1" ||
        envelope.direction !== "action" ||
        !payload ||
        typeof payload !== "object" ||
        !Number.isInteger(payload.requestId) ||
        payload.requestId < 1 ||
        typeof payload.type !== "string"
      ) return;

      try {
        if (payload.type === "disarm") {
          armed = false;
          const cleaned = cleanup();
          publishResult(
            payload,
            cleaned,
            cleaned ? "disarmed" : "cleanup-exception"
          );
          return;
        }
        if (payload.type === "arm") {
          const user = roots && roots.user;
          const actionBar = roots && roots.ui && roots.ui.ACTION_BAR;
          const world = roots && roots.world;
          const clientVersion = String(roots && roots.version || "")
            .replace(/^n/, "");
          if (clientVersion !== sourcePatch.CLIENT_VERSION) {
            publishResult(payload, false, "unsupported-client-version");
            return;
          }
          if (!connectionReady()) {
            publishResult(payload, false, "connection-not-ready");
            return;
          }
          if (
            !playerShip() ||
            !user ||
            typeof user.ship.stopFlying !== "function" ||
            typeof user.requestTarget !== "function" ||
            typeof user.forceMovement !== "function" ||
            typeof user.processDestMinimap !== "function" ||
            !world ||
            typeof world.checkShipWillHitBarrier !== "function" ||
            !actionBar ||
            typeof actionBar.handleCheckKeypress !== "function"
          ) {
            publishResult(payload, false, "adapter-not-ready");
            return;
          }
          armed = true;
          publishResult(payload, true, "armed");
          return;
        }
        if (!armed) {
          publishResult(payload, false, "not-armed");
          return;
        }
        if (!connectionReady()) {
          armed = false;
          cleanup();
          publishResult(payload, false, "connection-not-ready");
          return;
        }
        if (!playerShip()) {
          armed = false;
          cleanup();
          publishResult(payload, false, "player-not-ready");
          return;
        }

        if (payload.type === "selectNpc") {
          if (!liveNpc(payload.entityId)) {
            publishResult(payload, false, "target-not-live-npc");
            return;
          }
          const npc = liveNpc(payload.entityId);
          roots.user.requestTarget(canonicalEntityId(npc));
          publishResult(payload, true, "npc-selected");
          return;
        }
        if (payload.type === "pressAmmoKey") {
          if (!/^[0-9]$/.test(payload.key) || !liveNpc(roots.user.ship.targetID)) {
            publishResult(payload, false, "target-not-live-npc");
            return;
          }
          const handled = roots.ui.ACTION_BAR.handleCheckKeypress(
            `Digit${payload.key}`
          );
          if (handled !== true) {
            publishResult(payload, false, "ammo-bind-unavailable");
            return;
          }
          publishResult(payload, true, "ammo-key-pressed");
          return;
        }
        if (payload.type === "moveTo") {
          if (!Number.isFinite(payload.x) || !Number.isFinite(payload.y)) {
            publishResult(payload, false, "invalid-movement-point");
            return;
          }
          if (
            payload.entityId !== undefined &&
            !liveNpc(payload.entityId)
          ) {
            publishResult(payload, false, "target-not-live-npc");
            return;
          }
          const ship = roots.user.ship;
          const safeMovement = resolveSafeMovementPoint(
            roots.world,
            { x: Number(ship.x), y: Number(ship.y) },
            { x: payload.x, y: payload.y }
          );
          if (safeMovement.status === "unsafe") {
            publishResult(payload, false, safeMovement.reason);
            return;
          }
          roots.user.processDestMinimap(safeMovement.point);
          publishResult(payload, true, safeMovement.reason);
          return;
        }
        if (payload.type === "clearTarget") {
          roots.user.requestTarget(null);
          publishResult(payload, true, "target-cleared");
          return;
        }
        if (payload.type === "cancelMovement") {
          const ship = roots.user.ship;
          let cancelled = true;
          try {
            ship.stopFlying(false, true);
          } catch (_) {
            cancelled = false;
          }
          try {
            roots.user.forceMovement(Number(ship.x), Number(ship.y));
          } catch (_) {
            cancelled = false;
          }
          publishResult(
            payload,
            cancelled,
            cancelled ? "movement-cancelled" : "cleanup-exception"
          );
          return;
        }
        publishResult(payload, false, "unknown-action");
      } catch (_) {
        armed = false;
        cleanup();
        publishResult(payload, false, "action-exception");
      }
    }

    return { disarmNow, handleMessage, isArmed: () => armed };
  }

  function installActionExecutor(windowRef, roots) {
    const executor = createActionExecutor(windowRef, roots);
    windowRef.addEventListener("message", executor.handleMessage);
    windowRef.addEventListener("pagehide", executor.disarmNow, { once: true });
    windowRef.addEventListener("beforeunload", executor.disarmNow, { once: true });
    return executor;
  }

  function install() {
    if (!root || typeof root.Blob !== "function") return;
    let patchStatus = { status: "waiting", version: null, reason: "waiting" };
    let capturedSource = null;
    const NativeBlob = root.Blob;
    root.Blob = createPatchedBlobConstructor(
      NativeBlob,
      sourcePatch.patchGameSource,
      (status, originalSource) => {
        patchStatus = status;
        capturedSource = originalSource;
      }
    );

    const startedAt = Date.now();
    let sent = false;
    function sendDiagnostic() {
      if (sent) return;
      const roots = root.__SA_BOT_ROOTS__;
      const timedOut = Date.now() - startedAt >= 30000;
      if (!roots && !timedOut) {
        root.setTimeout(sendDiagnostic, 100);
        return;
      }
      sent = true;
      const summaries = {};
      if (roots) {
        for (const name of ["input", "ui", "user", "camera", "world", "renderer"]) {
          try {
            summaries[name] = sourcePatch.summarizeRoot(roots[name]);
          } catch (_) {
            summaries[name] = "[unavailable]";
          }
        }
        installActionExecutor(root, roots);
        startSnapshotPublisher(root, roots);
      }
      publishDiagnostic(
        root,
        {
          clientVersion: roots ? roots.version : patchStatus.version,
          patchStatus: roots ? "patched" : patchStatus.status,
          reason: roots ? "recognized-client" : patchStatus.reason || "timeout",
          pathname: root.location ? root.location.pathname : "",
          roots: summaries
        },
        capturedSource
      );
    }

    if (root.document && root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", sendDiagnostic, {
        once: true
      });
    } else {
      sendDiagnostic();
    }
  }

  install();
  return {
    createPatchedBlobConstructor,
    createActionExecutor,
    createSnapshot,
    installActionExecutor,
    publishDiagnostic,
    publishSnapshot,
    resolveSafeMovementPoint,
    startSnapshotPublisher
  };
});
