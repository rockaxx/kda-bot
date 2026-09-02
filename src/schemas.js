(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_ISOLATED_V1__, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  const CHANNEL = "sa-bot-v1";
  const ENTITY_TYPES = Object.freeze([
    "npc",
    "player",
    "ally",
    "pet",
    "drone",
    "object"
  ]);
  const ENTITY_TYPE_SET = new Set(ENTITY_TYPES);
  const CONNECTION_STATES = new Set([
    "connected",
    "connecting",
    "disconnected"
  ]);
  const DIRECTIONS = new Set(["snapshot", "diagnostic", "action"]);

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function isIdentifier(value) {
    return (
      (typeof value === "string" && value.length > 0) ||
      (Number.isFinite(value) && Number.isInteger(value))
    );
  }

  function isPercent(value) {
    return Number.isFinite(value) && value >= 0 && value <= 100;
  }

  function copyEntity(value, errors, path) {
    if (!isPlainObject(value)) {
      errors.push(`${path} must be an object`);
      return null;
    }
    if (!isIdentifier(value.id)) errors.push(`${path}.id is invalid`);
    if (!ENTITY_TYPE_SET.has(value.type)) {
      errors.push(`${path}.type is invalid`);
    }
    if (!Number.isFinite(value.x)) errors.push(`${path}.x is invalid`);
    if (!Number.isFinite(value.y)) errors.push(`${path}.y is invalid`);
    if (!isPercent(value.hpPercent)) {
      errors.push(`${path}.hpPercent is invalid`);
    }
    if (typeof value.alive !== "boolean") {
      errors.push(`${path}.alive is invalid`);
    }
    return {
      id: value.id,
      type: value.type,
      x: value.x,
      y: value.y,
      hpPercent: value.hpPercent,
      alive: value.alive
    };
  }

  function copyPlayer(value, errors) {
    if (!isPlainObject(value)) {
      errors.push("player must be an object");
      return null;
    }
    if (!isIdentifier(value.id)) errors.push("player.id is invalid");
    if (!Number.isFinite(value.x)) errors.push("player.x is invalid");
    if (!Number.isFinite(value.y)) errors.push("player.y is invalid");
    if (!isPercent(value.hpPercent)) {
      errors.push("player.hpPercent is invalid");
    }
    for (const key of ["alive", "moving", "inCombat"]) {
      if (typeof value[key] !== "boolean") {
        errors.push(`player.${key} is invalid`);
      }
    }
    return {
      id: value.id,
      x: value.x,
      y: value.y,
      hpPercent: value.hpPercent,
      alive: value.alive,
      moving: value.moving,
      inCombat: value.inCombat
    };
  }

  function copyTarget(value, errors) {
    if (value === null) return null;
    if (!isPlainObject(value)) {
      errors.push("target must be null or an object");
      return null;
    }
    if (!isIdentifier(value.id)) errors.push("target.id is invalid");
    if (!ENTITY_TYPE_SET.has(value.type)) {
      errors.push("target.type is invalid");
    }
    if (typeof value.alive !== "boolean") {
      errors.push("target.alive is invalid");
    }
    return { id: value.id, type: value.type, alive: value.alive };
  }

  function validateSnapshot(value) {
    const errors = [];
    if (!isPlainObject(value)) {
      return { ok: false, errors: ["snapshot must be an object"] };
    }
    if (!Number.isFinite(value.timestamp) || value.timestamp < 0) {
      errors.push("timestamp is invalid");
    }
    if (
      typeof value.clientVersion !== "string" ||
      value.clientVersion.length === 0
    ) {
      errors.push("clientVersion is invalid");
    }
    if (!CONNECTION_STATES.has(value.connectionState)) {
      errors.push("connectionState is invalid");
    }
    if (
      !Number.isInteger(value.mapId) ||
      value.mapId < 1 ||
      value.mapId > 10000
    ) {
      errors.push("mapId is invalid");
    }
    const player = copyPlayer(value.player, errors);
    const target = copyTarget(value.target, errors);
    let entities = [];
    if (!Array.isArray(value.entities)) {
      errors.push("entities must be an array");
    } else {
      entities = value.entities.map((entity, index) =>
        copyEntity(entity, errors, `entities[${index}]`)
      );
    }
    if (errors.length) return { ok: false, errors };
    return {
      ok: true,
      errors: [],
      value: {
        timestamp: value.timestamp,
        clientVersion: value.clientVersion,
        connectionState: value.connectionState,
        mapId: value.mapId,
        player,
        target,
        entities
      }
    };
  }

  function validateEnvelope(value, expectedDirection) {
    const errors = [];
    if (!isPlainObject(value)) {
      return { ok: false, errors: ["envelope must be an object"] };
    }
    if (value.channel !== CHANNEL) errors.push("channel is invalid");
    if (!DIRECTIONS.has(value.direction)) {
      errors.push("direction is invalid");
    }
    if (expectedDirection && value.direction !== expectedDirection) {
      errors.push("direction does not match expected direction");
    }
    let payload = value.payload;
    if (value.direction === "snapshot") {
      const snapshot = validateSnapshot(value.payload);
      if (!snapshot.ok) {
        errors.push(...snapshot.errors);
      } else {
        payload = snapshot.value;
      }
    } else if (!isPlainObject(value.payload)) {
      errors.push("payload must be an object");
    } else {
      payload = { ...value.payload };
    }
    if (errors.length) return { ok: false, errors };
    return {
      ok: true,
      errors: [],
      value: { channel: CHANNEL, direction: value.direction, payload }
    };
  }

  return {
    CHANNEL,
    ENTITY_TYPES,
    isPlainObject,
    validateEnvelope,
    validateSnapshot
  };
});
