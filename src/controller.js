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

  const EXPECTED_CLIENT_VERSION = "1.9.0.049";
  const TARGET_CONFIRMATION_TIMEOUT_MS = 1000;
  const MAX_TARGET_SELECTION_ATTEMPTS = 3;
  const {
    planEmergencyEscape,
    planFleePoint,
    planKitePoint,
    selectEdgeNpc
  } = planner;

  function createController({ settings, now = Date.now }) {
    let active = false;
    let state = { name: "STOPPED", reason: "not-started" };
    let actions = [];
    let lockedTargetId = null;
    let previousKitePoint = null;
    let lastMovementAt = Number.NEGATIVE_INFINITY;
    let selectionRequestedAt = Number.NEGATIVE_INFINITY;
    let selectionAttempts = 0;
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
      selectionRequestedAt = Number.NEGATIVE_INFINITY;
      selectionAttempts = 0;
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
      const movementPlan = plan.status === "safe"
        ? plan
        : planEmergencyEscape(snapshot.player, snapshot.entities, settings, null);
      if (movementPlan.status === "safe" || movementPlan.status === "escape") {
        queue({ type: "moveTo", x: movementPlan.point.x, y: movementPlan.point.y });
        previousKitePoint = movementPlan.point;
        lastMovementAt = now();
        transition("FLEEING", movementPlan.reason);
      } else {
        transition("REPAIR_WAIT", movementPlan.reason);
      }
    }

    function beginClusterEscape(snapshot, reason) {
      actions = [];
      if (lockedTargetId !== null) {
        blacklist.set(lockedTargetId, now() + settings.targetBlacklistMs);
      }
      queue({ type: "clearTarget" });
      resetCombatState();
      const plan = planEmergencyEscape(
        snapshot.player,
        snapshot.entities,
        settings,
        null
      );
      if (plan.status !== "escape") {
        queue({ type: "cancelMovement" });
        transition("SEARCHING", plan.reason || reason);
        return;
      }
      queue({ type: "moveTo", x: plan.point.x, y: plan.point.y });
      previousKitePoint = plan.point;
      lastMovementAt = now();
      transition("ESCAPING_CLUSTER", reason || plan.reason);
    }

    function hasClusterPressure(snapshot) {
      return snapshot.entities.some(
        (entity) =>
          entity.type === "npc" &&
          entity.alive &&
          Math.hypot(
            entity.x - snapshot.player.x,
            entity.y - snapshot.player.y
          ) <= 1.5 * settings.dangerRadius
      );
    }

    function handleClusterEscape(snapshot) {
      const liveNpcs = snapshot.entities.filter(
        (entity) => entity.type === "npc" && entity.alive
      );
      if (!hasClusterPressure(snapshot)) {
        resetCombatState();
        transition("SEARCHING", "cluster-escaped");
        return;
      }
      if (now() - lastMovementAt < settings.movementIntervalMs) return;
      const plan = planEmergencyEscape(
        snapshot.player,
        liveNpcs,
        settings,
        null
      );
      if (plan.status !== "escape") {
        queue({ type: "cancelMovement" });
        transition("SEARCHING", plan.reason);
        return;
      }
      queue({ type: "moveTo", x: plan.point.x, y: plan.point.y });
      previousKitePoint = plan.point;
      lastMovementAt = now();
      transition("ESCAPING_CLUSTER", plan.reason);
    }

    function abandonSelection(reason) {
      if (lockedTargetId !== null) {
        blacklist.set(lockedTargetId, now() + settings.targetBlacklistMs);
      }
      queue({ type: "clearTarget" });
      queue({ type: "cancelMovement" });
      resetCombatState();
      transition("SEARCHING", reason);
    }

    function currentLockedPlan(snapshot) {
      const target = snapshot.entities.find(
        (entity) =>
          entity.id === lockedTargetId &&
          entity.type === "npc" &&
          entity.alive
      );
      if (!target) return { status: "unsafe", reason: "target-gone" };
      const plan = planKitePoint(
        snapshot.player,
        target,
        snapshot.entities,
        settings,
        previousKitePoint,
        null
      );
      return { ...plan, target };
    }

    function queueTargetMove(plan) {
      queue({
        type: "moveTo",
        entityId: lockedTargetId,
        x: plan.point.x,
        y: plan.point.y
      });
      previousKitePoint = plan.point;
      lastMovementAt = now();
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
        if (hasClusterPressure(snapshot)) {
          beginClusterEscape(snapshot, "no-safe-npc");
        } else {
          transition("SEARCHING", "no-safe-npc");
        }
        return;
      }
      lockedTargetId = candidate.id;
      queue({ type: "selectNpc", entityId: candidate.id });
      selectionRequestedAt = now();
      selectionAttempts = 1;
      const plan = planKitePoint(
        snapshot.player,
        candidate,
        snapshot.entities,
        settings,
        null,
        null
      );
      if (plan.status === "safe") {
        queueTargetMove(plan);
      }
      transition("SELECTING_TARGET", "awaiting-target-confirmation");
    }

    function handleTargetConfirmation(snapshot) {
      if (!snapshot.target) {
        if (now() - selectionRequestedAt < TARGET_CONFIRMATION_TIMEOUT_MS) {
          return;
        }
        if (selectionAttempts >= MAX_TARGET_SELECTION_ATTEMPTS) {
          abandonSelection("target-selection-timeout");
          return;
        }
        const plan = currentLockedPlan(snapshot);
        if (plan.status !== "safe") {
          abandonSelection(plan.reason);
          return;
        }
        queue({ type: "selectNpc", entityId: lockedTargetId });
        queueTargetMove(plan);
        selectionRequestedAt = now();
        selectionAttempts += 1;
        return;
      }
      if (
        snapshot.target.type !== "npc" ||
        snapshot.target.id !== lockedTargetId ||
        !snapshot.target.alive
      ) {
        fault("unexpected-target-confirmation");
        return;
      }
      const plan = currentLockedPlan(snapshot);
      if (plan.status !== "safe") {
        beginClusterEscape(snapshot, plan.reason);
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
        beginClusterEscape(snapshot, plan.reason);
        return;
      }
      if (now() - lastMovementAt >= settings.movementIntervalMs) {
        queueTargetMove(plan);
      }
      transition("KITING", plan.reason);
    }

    function update(snapshot) {
      if (!active) return;
      if (handleFailClosed(snapshot)) return;

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

      if (state.name === "ESCAPING_CLUSTER") {
        handleClusterEscape(snapshot);
        return;
      }

      if (state.name === "SEARCHING") {
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
