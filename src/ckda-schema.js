(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    Object.assign(root.__SA_BOT_ISOLATED_V1__ || root.__SA_BOT_MAIN_V1__, api);
  }
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  const CKDA_CHANNEL = "sa-ckda-v1";
  const CKDA_MAX_ENVELOPE_BYTES = 4096;
  const CKDA_SUPPORTED_CLIENT_VERSION = "1.9.0.051";
  const CONNECTION_STATES = new Set([
    "connected",
    "connecting",
    "disconnected"
  ]);
  const DIRECTIONS = new Set(["snapshot", "command", "result", "lifecycle"]);
  const RELATIONS = new Set(["ally", "enemy"]);
  const PREMIUM_STATES = new Set(["inactive", "active", "unsupported"]);

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

  function isNonNegativeFinite(value) {
    return Number.isFinite(value) && value >= 0;
  }

  function isCooldownEndpoint(value) {
    return value === null || isNonNegativeFinite(value);
  }

  function copyPlayer(value, errors, path) {
    if (!isPlainObject(value)) {
      errors.push(`${path} must be an object`);
      return null;
    }
    if (!isIdentifier(value.id)) errors.push(`${path}.id is invalid`);
    if (!Number.isFinite(value.screenX)) errors.push(`${path}.screenX is invalid`);
    if (!Number.isFinite(value.screenY)) errors.push(`${path}.screenY is invalid`);
    if (!RELATIONS.has(value.relation)) errors.push(`${path}.relation is invalid`);
    if (typeof value.cloaked !== "boolean") {
      errors.push(`${path}.cloaked is invalid`);
    }
    if (!isNonNegativeFinite(value.observedAt)) {
      errors.push(`${path}.observedAt is invalid`);
    }
    if (!isCooldownEndpoint(value.empEndsAt)) {
      errors.push(`${path}.empEndsAt is invalid`);
    }
    if (!isCooldownEndpoint(value.ishEndsAt)) {
      errors.push(`${path}.ishEndsAt is invalid`);
    }
    return {
      id: value.id,
      screenX: value.screenX,
      screenY: value.screenY,
      relation: value.relation,
      cloaked: value.cloaked,
      observedAt: value.observedAt,
      empEndsAt: value.empEndsAt,
      ishEndsAt: value.ishEndsAt
    };
  }

  function validateCkdaSnapshot(value) {
    const errors = [];
    if (!isPlainObject(value)) {
      return { ok: false, errors: ["snapshot must be an object"] };
    }
    if (!isNonNegativeFinite(value.timestamp)) {
      errors.push("timestamp is invalid");
    }
    if (value.clientVersion !== CKDA_SUPPORTED_CLIENT_VERSION) {
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
    if (!PREMIUM_STATES.has(value.premiumState)) {
      errors.push("premiumState is invalid");
    }

    let players = [];
    if (!Array.isArray(value.players)) {
      errors.push("players must be an array");
    } else {
      players = value.players.map((player, index) =>
        copyPlayer(player, errors, `players[${index}]`)
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
        premiumState: value.premiumState,
        players
      }
    };
  }

  function validateCkdaEnvelope(value, expectedDirection) {
    const errors = [];
    if (!isPlainObject(value)) {
      return { ok: false, errors: ["envelope must be an object"] };
    }
    if (value.channel !== CKDA_CHANNEL) errors.push("channel is invalid");
    if (!DIRECTIONS.has(value.direction)) errors.push("direction is invalid");
    if (expectedDirection && value.direction !== expectedDirection) {
      errors.push("direction does not match expected direction");
    }

    let payload = value.payload;
    if (value.direction === "snapshot") {
      const snapshot = validateCkdaSnapshot(value.payload);
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
      value: { channel: CKDA_CHANNEL, direction: value.direction, payload }
    };
  }

  return {
    CKDA_CHANNEL,
    CKDA_MAX_ENVELOPE_BYTES,
    isPlainObject,
    validateCkdaEnvelope,
    validateCkdaSnapshot
  };
});
