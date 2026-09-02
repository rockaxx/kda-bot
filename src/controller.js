(function expose(root, factory) {
  const planner =
    typeof module === "object" && module.exports
      ? require("./planner.js")
      : root.__SA_BOT_ISOLATED_V1__;
  const api = factory(planner);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_ISOLATED_V1__, api);
})(typeof window === "object" ? window : null, function createApi(planner) {
  "use strict";

  const EXPECTED_CLIENT_VERSION = "1.9.0.045";
  const { planFleePoint, planKitePoint, selectEdgeNpc } = planner;

  function createController({ settings, now = Date.now }) {
    let active = false;
    let state = { name: "STOPPED", reason: "not-started" };
    let actions = [];
    let lockedTargetId = null;
    let previousKitePoint = null;
    let lastMovementAt = Number.NEGATIVE_INFINITY;
    const blacklist = new Map();

    function transition(name, reason) {
      state = { name, reason };
    }

    function queue(action) {
      actions.push(Object.freeze({ ...action }));
    }

    function resetCombatState() {
      lockedTargetId = null;
      previousKitePoint = null;
      lastMovementAt = Number.NEGATIVE_INFINITY;
    }

    function fault(reason) {
      active = false;
      actions = [];
      resetCombatState();
      transition("FAULT", reason);
    }

    function start() {
      active = true;
      actions = [];
      resetCombatState();
      blacklist.clear();
      transition("SEARCHING", "started");
    }

    function stop(reason = "stopped") {
      active = false;
      actions = [];
      resetCombatState();
      blacklist.clear();
      transition("STOPPED", reason);
    }

    function beginFlee(snapshot) {
      actions = [];
      queue({ type: "clearTarget" });
      queue({ type: "cancelMovement" });
      resetCombatState();
      transition("DISENGAGING", "low-hp");
      const plan = planFleePoint(
        snapshot.player,
        snapshot.entities,
        settings,
        null
      );
      if (plan.status === "safe") {
        queue({ type: "moveTo", x: plan.point.x, y: plan.point.y });
        previousKitePoint = plan.point;
        lastMovementAt = now();
        transition("FLEEING", plan.reason);
      } else {
        transition("REPAIR_WAIT", plan.reason);
      }
    }

    function handleFailClosed(snapshot) {
      if (snapshot.clientVersion !== EXPECTED_CLIENT_VERSION) {
        fault("unsupported-client-version");
        return true;
      }
      if (snapshot.connectionState !== "connected") {
        fault("connection-not-ready");
        return true;
      }
      if (!snapshot.player.alive) {
        fault("player-dead");
        return true;
      }
      const staleAfter = Math.max(2000, 5 * settings.planningIntervalMs);
      if (now() - snapshot.timestamp > staleAfter) {
        fault("stale-snapshot");
        return true;
      }
      if (snapshot.target && snapshot.target.type !== "npc") {
        fault("non-npc-target");
        return true;
      }
      return false;
    }

    function handleSearch(snapshot) {
      const candidate = selectEdgeNpc(
        snapshot.player,
        snapshot.entities,
        settings,
        blacklist,
        now()
      );
      if (!candidate) {
        transition("SEARCHING", "no-safe-npc");
        return;
      }
      lockedTargetId = candidate.id;
      queue({ type: "selectNpc", entityId: candidate.id });
      transition("SELECTING_TARGET", "awaiting-target-confirmation");
    }

    function handleTargetConfirmation(snapshot) {
      if (!snapshot.target) return;
      if (
        snapshot.target.type !== "npc" ||
        snapshot.target.id !== lockedTargetId ||
        !snapshot.target.alive
      ) {
        fault("unexpected-target-confirmation");
        return;
      }
      queue({ type: "pressAmmoKey", key: settings.ammoKey });
      transition("ATTACKING", "ammo-requested");
    }

    function handleKiting(snapshot) {
      const target = snapshot.entities.find(
        (entity) => entity.id === lockedTargetId
      );
      if (!target || !target.alive) {
        resetCombatState();
        transition("SEARCHING", "target-gone");
        return;
      }
      if (
        !snapshot.target ||
        snapshot.target.id !== lockedTargetId ||
        snapshot.target.type !== "npc"
      ) {
        fault("target-lock-lost");
        return;
      }
      const plan = planKitePoint(
        snapshot.player,
        target,
        snapshot.entities,
        settings,
        previousKitePoint,
        null
      );
      if (plan.status !== "safe") {
        blacklist.set(lockedTargetId, now() + settings.targetBlacklistMs);
        queue({ type: "clearTarget" });
        queue({ type: "cancelMovement" });
        resetCombatState();
        transition("SEARCHING", plan.reason);
        return;
      }
      if (now() - lastMovementAt >= settings.movementIntervalMs) {
        queue({ type: "moveTo", x: plan.point.x, y: plan.point.y });
        previousKitePoint = plan.point;
        lastMovementAt = now();
      }
      transition("KITING", plan.reason);
    }

    function update(snapshot) {
      if (!active) return;
      if (handleFailClosed(snapshot)) return;

      if (
        settings.requiredMap === null ||
        snapshot.mapId !== settings.requiredMap
      ) {
        actions = [];
        resetCombatState();
        transition("WAITING_FOR_MAP", "required-map-not-active");
        return;
      }

      if (state.name === "REPAIR_WAIT") {
        if (snapshot.player.hpPercent >= settings.resumeHpPercent) {
          transition("SEARCHING", "repair-complete");
        } else {
          return;
        }
      }

      if (state.name === "FLEEING") {
        if (!snapshot.player.inCombat) {
          if (snapshot.player.hpPercent >= settings.resumeHpPercent) {
            transition("SEARCHING", "repair-complete");
          } else {
            transition("REPAIR_WAIT", "out-of-combat-repairing");
            return;
          }
        } else {
          return;
        }
      }

      if (snapshot.player.hpPercent <= settings.fleeHpPercent) {
        beginFlee(snapshot);
        return;
      }

      if (state.name === "SEARCHING" || state.name === "WAITING_FOR_MAP") {
        handleSearch(snapshot);
        return;
      }
      if (state.name === "SELECTING_TARGET") {
        handleTargetConfirmation(snapshot);
        return;
      }
      if (state.name === "ATTACKING" || state.name === "KITING") {
        handleKiting(snapshot);
      }
    }

    function getState() {
      return { ...state };
    }

    function drainActions() {
      const drained = actions;
      actions = [];
      return drained;
    }

    return { drainActions, getState, start, stop, update };
  }

  return { createController, EXPECTED_CLIENT_VERSION };
});
