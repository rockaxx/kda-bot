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
        const hpPercent = percentage(
          entity.HP,
          entity.maxHp && entity.maxHp[entity.config]
        );
        if (
          (!Number.isInteger(id) && !(typeof id === "string" && id.length > 0)) ||
          !Number.isFinite(Number(entity.x)) ||
          !Number.isFinite(Number(entity.y)) ||
          hpPercent === null
        ) return;
        entities.push({
          id,
          type: "npc",
          x: Number(entity.x),
          y: Number(entity.y),
          hpPercent,
          alive: entityAlive(entity, hpPercent)
        });
      });

      let target = null;
      if (ship.targetID !== null && ship.targetID !== undefined && ship.targetID !== 0) {
        const targetEntity = typeof ships.get === "function"
          ? ships.get(ship.targetID)
          : null;
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
        connectionState: "connected",
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
    createSnapshot,
    publishDiagnostic,
    publishSnapshot,
    startSnapshotPublisher
  };
});
