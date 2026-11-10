(function expose(root, factory) {
  const dependency =
    typeof module === "object" && module.exports
      ? {
          ...require("./ckda-schema.js"),
          ...require("./ckda-core.js"),
          ...require("./design-main.js")
        }
      : root.__SA_BOT_MAIN_V1__;
  const api = factory(dependency);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    Object.assign(root.__SA_BOT_MAIN_V1__, api);
    api.installCkda(root);
  }
})(typeof window === "object" ? window : null, function createApi(dependency) {
  "use strict";

  const CLIENT_VERSION = "1.9.0.052";
  const CLIENT_VERSION_PATTERN = /^\d{1,6}(?:\.\d{1,6}){3}$/;
  const EFFECT_HOOK_MARK = Symbol("ckda-effect-hook");
  const INSTALLATION_MARK = Symbol.for("sa-ckda-installation-v1");
  const REFRESH_RATES = new Set([30, 60, 120, 240, 360]);
  const LEASE_DURATION_MS = 120000;
  const LEASE_CHECK_MS = 5000;

  function normalizedClientVersion(value) {
    return String(value || "").replace(/^n/, "");
  }

  function supportedClientVersion(value) {
    return CLIENT_VERSION_PATTERN.test(normalizedClientVersion(value));
  }

  function createPremiumOverride(roots, documentRef) {
    let requested = false;
    let activeRecord = null;

    // Kept in the public signature for callers that provide the page document.
    void documentRef;

    function currentUser() {
      try {
        return roots && roots.user;
      } catch (_) {
        return null;
      }
    }

    function compatibleRoots() {
      try {
        return supportedClientVersion(roots && roots.version);
      } catch (_) {
        return false;
      }
    }

    function restoreProperty(record) {
      try {
        if (record.descriptor) {
          Object.defineProperty(record.user, "isPremium", record.descriptor);
        } else if (!delete record.user.isPremium) {
          return false;
        }
        return true;
      } catch (_) {
        return false;
      }
    }

    function restorePremium(record) {
      if (typeof record.originalBoolean !== "boolean") return true;
      try {
        Reflect.apply(record.updatePremium, record.user, [record.originalBoolean]);
        return true;
      } catch (_) {
        return false;
      }
    }

    function install(user) {
      if (
        !compatibleRoots() ||
        !user ||
        (typeof user !== "object" && typeof user !== "function")
      ) {
        return null;
      }

      let descriptor;
      let updatePremium;
      let originalValue;
      try {
        descriptor = Object.getOwnPropertyDescriptor(user, "isPremium");
        if (descriptor && descriptor.configurable !== true) return null;
        updatePremium = user.updatePremium;
        if (typeof updatePremium !== "function") return null;
        originalValue = user.isPremium;
      } catch (_) {
        return null;
      }

      const record = {
        cleanupFailed: false,
        descriptor,
        originalValue,
        originalBoolean: typeof originalValue === "boolean" ? originalValue : null,
        updatePremium,
        user,
        lastServerWrite: undefined
      };
      try {
        Object.defineProperty(user, "isPremium", {
          configurable: true,
          enumerable: descriptor ? descriptor.enumerable : true,
          get() { return true; },
          set(value) { record.lastServerWrite = value; }
        });
        Reflect.apply(updatePremium, user, [true]);
        return record;
      } catch (_) {
        // An updater may mutate presentation before throwing. Keep failed cleanup
        // recoverable by disable/refresh, including a failure during installation.
        return deactivate(record) ? null : record;
      }
    }

    function restorationMatches(record) {
      try {
        const actual = Object.getOwnPropertyDescriptor(record.user, "isPremium");
        const descriptorMatches = record.descriptor
          ? actual && Object.keys(record.descriptor).every(key =>
            Object.is(actual[key], record.descriptor[key])) &&
            Object.keys(actual).length === Object.keys(record.descriptor).length
          : actual === undefined;
        return Boolean(descriptorMatches) && Object.is(record.user.isPremium, record.originalValue);
      } catch (_) {
        return false;
      }
    }

    function deactivate(record) {
      const propertyRestored = restoreProperty(record);
      const premiumRestored = restorePremium(record);
      const descriptorReapplied = restoreProperty(record);
      const effectiveStateRestored = restorationMatches(record);
      record.cleanupFailed = !propertyRestored || !premiumRestored ||
        !descriptorReapplied || !effectiveStateRestored;
      return !record.cleanupFailed;
    }

    function state() {
      if (activeRecord) {
        return !activeRecord.cleanupFailed && requested ? "active" : "unsupported";
      }
      return requested ? "unsupported" : "inactive";
    }

    function enable() {
      requested = true;
      if (activeRecord) {
        return activeRecord.user === currentUser() && !activeRecord.cleanupFailed
          ? true
          : refresh();
      }
      activeRecord = install(currentUser());
      return Boolean(activeRecord && !activeRecord.cleanupFailed);
    }

    function disable() {
      requested = false;
      if (!activeRecord) return false;
      const record = activeRecord;
      if (!deactivate(record)) return false;
      activeRecord = null;
      return true;
    }

    function refresh() {
      const user = currentUser();
      if (activeRecord && (activeRecord.user !== user || activeRecord.cleanupFailed)) {
        const record = activeRecord;
        if (!deactivate(record)) return false;
        activeRecord = null;
      }
      if (!requested) return false;
      if (activeRecord) return true;
      activeRecord = install(user);
      return Boolean(activeRecord && !activeRecord.cleanupFailed);
    }

    return { enable, disable, refresh, state };
  }

  function validCooldownEndpoint(value) {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  function hasCanonicalId(value) {
    return (
      (typeof value === "string" && value.length > 0) ||
      (Number.isFinite(value) && Number.isInteger(value))
    );
  }

  function matchedPrototypeMethods(target, markers) {
    if (
      !target ||
      (typeof target !== "object" && typeof target !== "function") ||
      !Array.isArray(markers) ||
      markers.length === 0 ||
      markers.some((marker) => typeof marker !== "string" || marker.length === 0)
    ) {
      return [];
    }

    const matches = [];
    try {
      for (
        let prototype = Object.getPrototypeOf(target);
        prototype && prototype !== Object.prototype;
        prototype = Object.getPrototypeOf(prototype)
      ) {
        for (const name of Object.getOwnPropertyNames(prototype)) {
          const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
          if (!descriptor || typeof descriptor.value !== "function") continue;
          const source = Function.prototype.toString.call(descriptor.value);
          if (markers.every((marker) => source.includes(marker))) {
            matches.push({ owner: prototype, name, descriptor });
          }
        }
      }
    } catch (_) {
      return [];
    }
    return matches;
  }

  function findUniquePrototypeMethod(target, markers) {
    const matches = matchedPrototypeMethods(target, markers);
    return matches.length === 1 ? matches[0].name : null;
  }

  function findPrototypeMethod(target, name) {
    if (typeof name !== "string" || name.length === 0) return null;
    try {
      for (
        let prototype = Object.getPrototypeOf(target);
        prototype && prototype !== Object.prototype;
        prototype = Object.getPrototypeOf(prototype)
      ) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        if (descriptor && typeof descriptor.value === "function") {
          return { owner: prototype, name, descriptor };
        }
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  function unsupportedEffectHooks() {
    return { supported: false, cleanup() { return false; } };
  }

  function validEffectTargetId(target) {
    if (!target || (typeof target !== "object" && typeof target !== "function")) {
      return null;
    }
    try {
      return hasCanonicalId(target.ID) ? target.ID : null;
    } catch (_) {
      return null;
    }
  }

  function installEffectHooks(world, cooldowns, settings) {
    if (!cooldowns || typeof cooldowns.activate !== "function") {
      return unsupportedEffectHooks();
    }

    const emp = findPrototypeMethod(world, "addEmpNew");
    const ishMatches = matchedPrototypeMethods(world, ["instaShield", "tshield"]);
    if (
      !emp ||
      ishMatches.length !== 1 ||
      (emp.owner === ishMatches[0].owner && emp.name === ishMatches[0].name) ||
      emp.descriptor.configurable !== true ||
      ishMatches[0].descriptor.configurable !== true ||
      emp.descriptor.value[EFFECT_HOOK_MARK] === true ||
      ishMatches[0].descriptor.value[EFFECT_HOOK_MARK] === true
    ) {
      return unsupportedEffectHooks();
    }

    const ish = ishMatches[0];
    function wrap(original, kind, duration) {
      const wrapper = function effectHook(...args) {
        const result = Reflect.apply(original, this, args);
        const targetId = validEffectTargetId(args[0]);
        if (targetId !== null) {
          try {
            cooldowns.activate(kind, targetId, duration);
          } catch (_) {
            // Tracking must not alter game method return or error behavior.
          }
        }
        return result;
      };
      wrapper[EFFECT_HOOK_MARK] = true;
      return wrapper;
    }

    const empWrapper = wrap(emp.descriptor.value, "emp", settings && settings.empCooldownMs);
    const ishWrapper = wrap(ish.descriptor.value, "ish", settings && settings.ishCooldownMs);
    try {
      Object.defineProperty(emp.owner, emp.name, {
        ...emp.descriptor,
        value: empWrapper
      });
      Object.defineProperty(ish.owner, ish.name, {
        ...ish.descriptor,
        value: ishWrapper
      });
    } catch (_) {
      try {
        Object.defineProperty(emp.owner, emp.name, emp.descriptor);
      } catch (_) {
        // Preserve original error-free contract when an exotic target rejects cleanup.
      }
      return unsupportedEffectHooks();
    }

    let installed = true;
    return {
      supported: true,
      cleanup() {
        if (!installed) return false;
        installed = false;
        try {
          Object.defineProperty(emp.owner, emp.name, emp.descriptor);
          Object.defineProperty(ish.owner, ish.name, ish.descriptor);
          return true;
        } catch (_) {
          return false;
        }
      }
    };
  }

  function createCkdaSnapshot(roots, cooldowns, premiumState, timestamp) {
    try {
      const world = roots && roots.world;
      const user = roots && roots.user;
      const ships = world && world.MAP_SHIPS;
      const mapId = Number(world && world.mapId);
      if (
        !dependency ||
        typeof dependency.classifyPlayer !== "function" ||
        typeof dependency.projectPlayer !== "function" ||
        typeof dependency.validateCkdaSnapshot !== "function" ||
        !user ||
        !user.ship ||
        !roots.network ||
        roots.network.connected !== true ||
        !supportedClientVersion(roots.version) ||
        !Number.isInteger(mapId) ||
        mapId < 1 ||
        typeof ships.forEach !== "function" ||
        !cooldowns ||
        typeof cooldowns.read !== "function" ||
        !Number.isFinite(timestamp) ||
        timestamp < 0
      ) {
        return null;
      }

      const players = [];
      ships.forEach((entity) => {
        const relation = dependency.classifyPlayer(entity, roots);
        const projection = relation && dependency.projectPlayer(entity, roots);
        if (!projection) return;
        const cooldown = cooldowns.read(entity.ID) || {};
        players.push({
          id: entity.ID,
          screenX: projection.screenX,
          screenY: projection.screenY,
          relation,
          cloaked: Boolean(entity.isCloaked),
          observedAt: timestamp,
          empEndsAt: validCooldownEndpoint(cooldown.empEndsAt),
          ishEndsAt: validCooldownEndpoint(cooldown.ishEndsAt)
        });
      });

      const result = dependency.validateCkdaSnapshot({
        timestamp,
        clientVersion: normalizedClientVersion(roots.version),
        connectionState: "connected",
        mapId,
        premiumState,
        players
      });
      return result.ok ? result.value : null;
    } catch (_) {
      return null;
    }
  }

  function startCkdaPublisher(windowRef, roots, options = {}) {
    const now = typeof options.now === "function" ? options.now :
      dependency.createMonotonicEpochClock(windowRef && windowRef.performance);
    const cooldowns =
      options.cooldowns &&
      typeof options.cooldowns.read === "function" &&
      typeof options.cooldowns.clearAll === "function"
        ? options.cooldowns
        : dependency.createCooldownRegistry(now);
    const premiumState = () => typeof options.premiumState === "function"
      ? options.premiumState() : typeof options.premiumState === "string"
        ? options.premiumState : "inactive";
    let stopped = false;
    let timer = null;
    let refreshFps = REFRESH_RATES.has(options.refreshFps) ? options.refreshFps : 60;
    let lastWorld = roots && roots.world;
    let lastMapId = Number(lastWorld && lastWorld.mapId);
    let playerCursor = 0;
    let lastPublished = null;

    function clear() {
      playerCursor = 0;
      cooldowns.clearAll();
      const previous = lastPublished;
      lastPublished = null;
      if (previous && !stopped) {
        // Reuse the disconnected snapshot contract to invalidate retained
        // observations, including a world replacement that keeps the same map ID.
        windowRef.postMessage({
          channel: dependency.CKDA_CHANNEL,
          direction: "snapshot",
          payload: { ...previous, timestamp: now(), connectionState: "disconnected", players: [] }
        }, "*");
      }
    }

    function refresh() {
      if (stopped) return null;
      try {
        if (typeof options.beforeSnapshot === "function") options.beforeSnapshot();
        const world = roots && roots.world;
        const mapId = Number(world && world.mapId);
        if (world !== lastWorld || !Object.is(mapId, lastMapId) || roots?.network?.connected !== true) {
          clear();
          lastWorld = world;
          lastMapId = mapId;
        }
        const snapshot = createCkdaSnapshot(roots, cooldowns, premiumState(), now());
        if (!snapshot || !windowRef || typeof windowRef.postMessage !== "function") {
          clear();
          return null;
        }
        const payload = { ...snapshot, players: [] };
        const envelope = { channel: dependency.CKDA_CHANNEL, direction: "snapshot", payload };
        const encoder = new TextEncoder();
        let bytes = encoder.encode(JSON.stringify(envelope)).byteLength;
        const count = snapshot.players.length;
        const start = count ? playerCursor % count : 0;
        let considered = 0;
        for (; considered < count; considered += 1) {
          const player = snapshot.players[(start + considered) % count];
          const addedBytes = encoder.encode(JSON.stringify(player)).byteLength + (payload.players.length ? 1 : 0);
          if (bytes + addedBytes > dependency.CKDA_MAX_ENVELOPE_BYTES) {
            // An individually oversized record cannot block later records. When
            // this batch is full, resume with its first unsent record next time.
            if (payload.players.length) break;
            continue;
          }
          payload.players.push(player);
          bytes += addedBytes;
        }
        playerCursor = count ? (start + considered) % count : 0;
        windowRef.postMessage(envelope, "*");
        lastPublished = { ...payload, players: [] };
        return payload;
      } catch (_) {
        try { clear(); } catch (_) { /* A disconnected consumer may reject the reset message. */ }
        return null;
      }
    }

    function schedule(fps = refreshFps) {
      const nextFps = REFRESH_RATES.has(fps) ? fps : 60;
      if (timer !== null && windowRef && typeof windowRef.clearInterval === "function") {
        windowRef.clearInterval(timer);
      }
      refreshFps = nextFps;
      timer = null;
      if (windowRef && typeof windowRef.setInterval === "function") {
        timer = windowRef.setInterval(refresh, 1000 / refreshFps);
      }
      return refreshFps;
    }

    refresh();
    schedule();

    function stop() {
      if (stopped) return false;
      stopped = true;
      clear();
      if (
        timer !== null &&
        windowRef &&
        typeof windowRef.clearInterval === "function"
      ) {
        windowRef.clearInterval(timer);
      }
      return true;
    }

    return { stop, refresh, clear, setFps: schedule };
  }

  function validatedCommand(event, windowRef) {
    try {
      if (!event || event.source !== windowRef) return null;
      if (new TextEncoder().encode(JSON.stringify(event.data)).byteLength > dependency.CKDA_MAX_ENVELOPE_BYTES) return null;
      const envelope = dependency.validateCkdaEnvelope(event.data, "command");
      if (!envelope.ok) return null;
      return envelope.value.payload;
    } catch (_) {
      return null;
    }
  }

  function installCkda(windowRef, options = {}) {
    if (!windowRef || typeof windowRef.addEventListener !== "function") return null;
    if (windowRef[INSTALLATION_MARK]) return windowRef[INSTALLATION_MARK];
    const now = typeof options.now === "function" ? options.now :
      dependency.createMonotonicEpochClock(windowRef.performance);
    let stopped = false;
    let pollTimer = null;
    let leaseTimer = null;
    let leaseDeadline = now() + LEASE_DURATION_MS;
    let publisher = null;
    let cooldowns = null;
    let premium = null;
    let rankOverride = null;
    let shipOverride = null;
    let hooks = null;
    let hookedWorld = null;
    let roots = null;
    let effects = { empCooldownMs: 28000, ishCooldownMs: 28000 };

    function result(payload) {
      windowRef.postMessage({ channel: dependency.CKDA_CHANNEL, direction: "result", payload }, "*");
    }

    function updateHooks(force = false) {
      const world = roots.world;
      if (world === hookedWorld && !force) return;
      hooks?.cleanup();
      if (world !== hookedWorld) cooldowns.clearAll();
      hookedWorld = world;
      hooks = installEffectHooks(world, cooldowns, effects);
    }

    function handleMessage(event) {
      if (stopped) return;
      const command = validatedCommand(event, windowRef);
      if (!command) return;
      if (command.type === "teardown") { cleanup(); return; }
      if (command.type === "renew-lease") {
        leaseDeadline = now() + LEASE_DURATION_MS;
        return;
      }
      if (!publisher) { tryInstall(); return; }
      try {
        if (command.type === "set-premium") {
          if (command.enabled) premium.enable();
          else premium.disable();
        } else if (command.type === "configure-effects") {
          effects = { empCooldownMs: command.empCooldownMs, ishCooldownMs: command.ishCooldownMs };
          updateHooks(true);
        } else if (command.type === "configure-refresh") {
          publisher.setFps(command.fps);
        } else if (command.type === "clear") {
          publisher.clear();
        } else if (command.type === "set-design-rank") {
          rankOverride?.setRank(command.rankId);
        } else if (command.type === "set-design-ship") {
          shipOverride?.setDesign(command.shipDesign);
        }
        publisher.refresh();
      } catch (_) {
        result({ requestId: command.requestId, type: command.type, state: "error" });
      }
    }

    function cleanup() {
      if (stopped) return false;
      stopped = true;
      if (pollTimer !== null) windowRef.clearInterval(pollTimer);
      if (leaseTimer !== null) windowRef.clearInterval(leaseTimer);
      pollTimer = null;
      leaseTimer = null;
      windowRef.removeEventListener("message", handleMessage);
      windowRef.removeEventListener("pagehide", cleanup);
      windowRef.removeEventListener("beforeunload", cleanup);
      for (const release of [
        () => publisher?.stop(), () => hooks?.cleanup(),
        () => premium?.disable(), () => rankOverride?.cleanup(),
        () => shipOverride?.cleanup(), () => cooldowns?.clearAll()
      ]) {
        try { release(); } catch (_) { /* Release the remaining independent resources. */ }
      }
      if (windowRef[INSTALLATION_MARK] === installation) delete windowRef[INSTALLATION_MARK];
      return true;
    }

    function tryInstall() {
      if (stopped || publisher) return;
      try {
        const candidate = windowRef.__SA_BOT_ROOTS__;
        if (!candidate) return;
        if (!supportedClientVersion(candidate.version)) {
          result({ state: "unsupported-client" });
          return;
        }
        roots = candidate;
        cooldowns = dependency.createCooldownRegistry(now);
        premium = createPremiumOverride(roots, windowRef.document);
        rankOverride = dependency.createRankOverride({
          windowRef,
          documentRef: windowRef.document,
          getRoots: () => windowRef.__SA_BOT_ROOTS__ || roots
        });
        shipOverride = dependency.createShipOverride({
          windowRef,
          getRoots: () => windowRef.__SA_BOT_ROOTS__ || roots
        });
        publisher = startCkdaPublisher(windowRef, roots, {
          now,
          cooldowns,
          premiumState: () => premium.state(),
          beforeSnapshot() { updateHooks(); premium.refresh(); }
        });
        if (pollTimer !== null) windowRef.clearInterval(pollTimer);
        pollTimer = null;
        result({ type: "ready" });
      } catch (_) {
        hooks?.cleanup();
        premium?.disable();
        cooldowns?.clearAll();
      }
    }

    const installation = { cleanup };
    windowRef[INSTALLATION_MARK] = installation;
    windowRef.addEventListener("message", handleMessage);
    windowRef.addEventListener("pagehide", cleanup);
    windowRef.addEventListener("beforeunload", cleanup);
    leaseTimer = windowRef.setInterval(() => {
      if (!stopped && now() >= leaseDeadline) cleanup();
    }, LEASE_CHECK_MS);
    tryInstall();
    if (!publisher && !stopped) pollTimer = windowRef.setInterval(tryInstall, 100);
    return installation;
  }

  return {
    createPremiumOverride,
    createCkdaSnapshot,
    findUniquePrototypeMethod,
    installEffectHooks,
    installCkda,
    startCkdaPublisher
  };
});
