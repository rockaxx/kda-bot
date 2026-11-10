const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CKDA_CHANNEL,
  validateCkdaEnvelope,
  validateCkdaSnapshot
} = require("../src/ckda-schema.js");

const validSnapshot = {
  timestamp: 1000,
  clientVersion: "1.9.0.052",
  connectionState: "connected",
  mapId: 17,
  premiumState: "inactive",
  players: [{
    id: 42,
    screenX: 100,
    screenY: 200,
    relation: "enemy",
    cloaked: true,
    observedAt: 1000,
    empEndsAt: null,
    ishEndsAt: 29000
  }]
};

test("accepts C-KDA snapshots and copies only declared keys", () => {
  const input = {
    ...validSnapshot,
    ignored: "snapshot",
    players: [{ ...validSnapshot.players[0], ignored: "player" }]
  };
  const result = validateCkdaSnapshot(input);

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, validSnapshot);
  assert.notEqual(result.value, input);
  assert.notEqual(result.value.players, input.players);
  assert.notEqual(result.value.players[0], input.players[0]);
});

test("accepts version labels as metadata and rejects invalid metadata", () => {
  const result = validateCkdaSnapshot({
    ...validSnapshot,
    clientVersion: "1.9.0.7777"
  });
  assert.equal(result.ok, true);
  assert.equal(validateCkdaSnapshot({ ...validSnapshot, clientVersion: "future" }).ok, true);
  const malformed = validateCkdaSnapshot({ ...validSnapshot, clientVersion: {} });
  assert.equal(malformed.ok, false);
  assert.deepEqual(malformed.errors, ["clientVersion is invalid"]);
});

test("accepts a matching C-KDA snapshot envelope", () => {
  const result = validateCkdaEnvelope({
    channel: CKDA_CHANNEL,
    direction: "snapshot",
    payload: validSnapshot
  }, "snapshot");

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    channel: "sa-ckda-v1",
    direction: "snapshot",
    payload: validSnapshot
  });
});

test("rejects wrong C-KDA channel, direction, and non-object payloads", () => {
  assert.equal(validateCkdaEnvelope({
    channel: "sa-bot-v1",
    direction: "snapshot",
    payload: validSnapshot
  }, "snapshot").ok, false);
  assert.equal(validateCkdaEnvelope({
    channel: CKDA_CHANNEL,
    direction: "command",
    payload: {}
  }, "snapshot").ok, false);
  assert.equal(validateCkdaEnvelope({
    channel: CKDA_CHANNEL,
    direction: "unknown",
    payload: {}
  }).ok, false);
  assert.equal(validateCkdaEnvelope({
    channel: CKDA_CHANNEL,
    direction: "result",
    payload: []
  }).ok, false);
});

test("rejects non-finite player positions and invalid player fields", () => {
  const invalidPosition = {
    ...validSnapshot,
    players: [{ ...validSnapshot.players[0], screenX: Infinity }]
  };
  const invalidFields = {
    ...validSnapshot,
    premiumState: "enabled",
    players: [{
      ...validSnapshot.players[0],
      relation: "neutral",
      cloaked: "true",
      observedAt: -1,
      empEndsAt: -1,
      ishEndsAt: Number.NaN
    }]
  };

  assert.equal(validateCkdaEnvelope({
    channel: CKDA_CHANNEL,
    direction: "snapshot",
    payload: invalidPosition
  }, "snapshot").ok, false);
  assert.equal(validateCkdaSnapshot(invalidFields).ok, false);
});

test("allows every documented C-KDA direction and cooldown endpoint", () => {
  for (const direction of ["command", "result", "lifecycle"]) {
    assert.equal(validateCkdaEnvelope({
      channel: CKDA_CHANNEL,
      direction,
      payload: { requestId: 1, type: "clear" }
    }).ok, true);
  }

  const snapshot = {
    ...validSnapshot,
    premiumState: "unsupported",
    players: [{
      ...validSnapshot.players[0],
      relation: "ally",
      empEndsAt: 0,
      ishEndsAt: null
    }]
  };
  assert.equal(validateCkdaSnapshot(snapshot).ok, true);
});

test("C-KDA command schema strictly allows teardown and renew-lease without action fields", () => {
  for (const type of ["teardown", "renew-lease"]) {
    const envelope = { channel: CKDA_CHANNEL, direction: "command", payload: { requestId: 1, type } };
    assert.equal(validateCkdaEnvelope(envelope).ok, true);
    for (const payload of [
      { requestId: 1, type, targetId: 8 }, { requestId: 0, type }, { type },
      { requestId: 1, type: "attack" }
    ]) assert.equal(validateCkdaEnvelope({ ...envelope, payload }).ok, false);
  }
});

test("C-KDA command schema strictly validates Design Mode rank commands", () => {
  const envelope = {
    channel: CKDA_CHANNEL,
    direction: "command",
    payload: { requestId: 1, type: "set-design-rank", rankId: 20 }
  };
  assert.equal(validateCkdaEnvelope(envelope).ok, true);
  for (const payload of [
    { requestId: 1, type: "set-design-rank", rankId: -1 },
    { requestId: 1, type: "set-design-rank", rankId: 21 },
    { requestId: 1, type: "set-design-rank", rankId: "20" },
    { requestId: 1, type: "set-design-rank", rankId: 20, extra: true }
  ]) {
    assert.equal(validateCkdaEnvelope({ ...envelope, payload }).ok, false);
  }
});

test("C-KDA command schema validates live ship design commands", () => {
  const envelope = { channel: CKDA_CHANNEL, direction: "command",
    payload: { requestId: 1, type: "set-design-ship", shipDesign: "regalia" } };
  assert.equal(validateCkdaEnvelope(envelope).ok, true);
  for (const shipDesign of ["unknown", "", 218]) {
    assert.equal(validateCkdaEnvelope({ ...envelope, payload: { ...envelope.payload, shipDesign } }).ok, false);
  }
});

test("C-KDA command schema accepts only supported marker refresh rates", () => {
  const envelope = { channel: CKDA_CHANNEL, direction: "command",
    payload: { requestId: 1, type: "configure-refresh", fps: 60 } };
  for (const fps of [30, 60, 120, 240, 360]) {
    assert.equal(validateCkdaEnvelope({ ...envelope, payload: { ...envelope.payload, fps } }).ok, true);
  }
  for (const fps of [0, 15, 59, 119, 361, "60"]) {
    assert.equal(validateCkdaEnvelope({ ...envelope, payload: { ...envelope.payload, fps } }).ok, false);
  }
});
