(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_ISOLATED_V1__, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  function installEmergencyStop(windowRef, onStop) {
    function handleKeydown(event) {
      if (event.code !== "Escape" || event.shiftKey !== true) return;
      if (typeof event.preventDefault === "function") event.preventDefault();
      onStop();
    }
    windowRef.addEventListener("keydown", handleKeydown);
    return () => windowRef.removeEventListener("keydown", handleKeydown);
  }

  function createRuntime({
    controller,
    bridge,
    logger,
    now = Date.now,
    staleAfterMs = 2000,
    setIntervalRef = setInterval,
    clearIntervalRef = clearInterval,
    onChange = () => {}
  }) {
    let active = false;
    let lastSnapshotAt = null;
    const watchdogIntervalMs = Math.min(
      500,
      Math.max(100, Math.floor(staleAfterMs / 4))
    );
    let expectedWatchdogAt = now() + watchdogIntervalMs;

    function dispatchControllerActions() {
      for (const action of controller.drainActions()) {
        bridge.sendAction(action);
        logger.add("action-sent", action);
      }
    }

    function disarm(reason, preserveFault = false) {
      active = false;
      if (!preserveFault) {
        try {
          controller.stop(reason);
        } catch (_) {}
      }
      try {
        bridge.sendAction({ type: "disarm" });
      } catch (_) {
        try {
          logger.add("action-error", {
            type: "disarm",
            reason: "bridge-exception"
          });
        } catch (_) {}
      }
      try {
        logger.add("mode", { mode: "ACTIVE", state: "stopped", reason });
      } catch (_) {}
      try {
        onChange();
      } catch (_) {}
    }

    function processSnapshot(value) {
      try {
        controller.update(value);
        dispatchControllerActions();
        if (controller.getState().name === "FAULT") {
          disarm(controller.getState().reason, true);
        }
      } catch (_) {
        disarm("runtime-exception");
      }
    }

    function start(value) {
      if (!value || active) return false;
      try {
        active = true;
        lastSnapshotAt = now();
        controller.start();
        bridge.sendAction({ type: "arm" });
        logger.add("mode", { mode: "ACTIVE", state: "started" });
        processSnapshot(value);
        onChange();
      } catch (_) {
        disarm("runtime-callback-exception");
      }
      return active;
    }

    function stop(reason = "stopped") {
      disarm(reason);
    }

    function receiveSnapshot(value) {
      try {
        lastSnapshotAt = now();
        if (active) processSnapshot(value);
        onChange();
      } catch (_) {
        disarm("runtime-callback-exception");
      }
    }

    function receiveActionResult(result) {
      try {
        logger.add("action-result", result);
        if (active && result.ok === false) {
          disarm(`action-failed:${result.reason}`);
          return;
        }
        onChange();
      } catch (_) {
        disarm("runtime-callback-exception");
      }
    }

    const watchdogId = setIntervalRef(() => {
      const checkedAt = now();
      const schedulerDelay = checkedAt - expectedWatchdogAt;
      expectedWatchdogAt = checkedAt + watchdogIntervalMs;
      if (active && schedulerDelay > staleAfterMs) {
        disarm("watchdog-scheduler-delay");
        return;
      }
      if (
        active &&
        lastSnapshotAt !== null &&
        checkedAt - lastSnapshotAt > staleAfterMs
      ) {
        disarm("stale-snapshot-watchdog");
      }
    }, watchdogIntervalMs);

    function destroy() {
      if (active) disarm("unload");
      clearIntervalRef(watchdogId);
    }

    return {
      destroy,
      isActive: () => active,
      receiveActionResult,
      receiveSnapshot,
      start,
      stop
    };
  }

  return { createRuntime, installEmergencyStop };
});
