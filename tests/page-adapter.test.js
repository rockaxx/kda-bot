const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSnapshot,
  createPatchedBlobConstructor,
  publishDiagnostic,
  startSnapshotPublisher
} = require("../src/page-adapter.js");
const { patchGameSource } = require("../src/source-patch.js");

class FakeBlob {
  constructor(parts, options) {
    this.parts = parts;
    this.options = options;
  }
}

const recognizedSource =
  "const _0x416562='1.9.0.045';" +
  "_0x429744['mapId'];_0x22a0bf['ship'];" +
  "_0x607b9['gamepadTargeter'];_0x229c50['initListeners'];";

test("Blob proxy patches only recognized JavaScript source", () => {
  const statuses = [];
  const PatchedBlob = createPatchedBlobConstructor(
    FakeBlob,
    patchGameSource,
    (status) => statuses.push(status)
  );

  const blob = new PatchedBlob([recognizedSource], {
    type: "application/javascript"
  });

  assert.match(blob.parts[0], /__SA_BOT_ROOTS__/);
  assert.equal(statuses[0].status, "patched");
});

test("Blob proxy preserves non-JavaScript parts", () => {
  const parts = ["plain text"];
  const PatchedBlob = createPatchedBlobConstructor(
    FakeBlob,
    patchGameSource,
    () => {
      throw new Error("status callback must not run");
    }
  );

  const blob = new PatchedBlob(parts, { type: "text/plain" });

  assert.equal(blob.parts, parts);
  assert.deepEqual(blob.options, { type: "text/plain" });
});

test("diagnostic publisher includes captured client source separately", () => {
  const messages = [];
  const windowRef = {
    postMessage(message, target) {
      assert.equal(target, "*");
      messages.push(message);
    }
  };

  publishDiagnostic(
    windowRef,
    { patchStatus: "unsupported", reason: "root-fingerprint-mismatch" },
    "const liveClient = true;"
  );

  assert.deepEqual(messages.map((message) => message.direction), [
    "diagnostic",
    "source"
  ]);
  assert.equal(messages[1].payload.source, "const liveClient = true;");
});

function liveRoots(overrides = {}) {
  const npc = {
    isNpc: true,
    x: 900,
    y: 200,
    HP: 120,
    maxHp: { 1: 100 },
    config: 1,
    destroyed: false
  };
  const player = {
    isNpc: false,
    x: 400,
    y: 300,
    HP: 100,
    maxHp: { 1: 100 },
    config: 1,
    destroyed: false
  };
  return {
    version: "n1.9.0.049",
    user: {
      userID: 77,
      ship: {
        x: 10,
        y: 20,
        HP: 75,
        maxHp: { 1: 100 },
        config: 1,
        destroyed: false,
        speed: { x: 2, y: 0 },
        isAttacking: true,
        targetID: 200
      }
    },
    world: {
      mapId: "5",
      MAP_SHIPS: new Map([[200, npc], [300, player]])
    },
    ...overrides
  };
}

test("normalizes current live roots into an NPC-only snapshot", () => {
  const snapshot = createSnapshot(liveRoots(), 1234);

  assert.deepEqual(snapshot, {
    timestamp: 1234,
    clientVersion: "1.9.0.049",
    connectionState: "connected",
    mapId: 5,
    player: {
      id: 77,
      x: 10,
      y: 20,
      hpPercent: 75,
      alive: true,
      moving: true,
      inCombat: true
    },
    target: { id: 200, type: "npc", alive: true },
    entities: [
      {
        id: 200,
        type: "npc",
        x: 900,
        y: 200,
        hpPercent: 100,
        alive: true
      }
    ]
  });
});

test("rejects incomplete roots instead of publishing guessed state", () => {
  assert.equal(createSnapshot({}, 1234), null);
  assert.equal(
    createSnapshot(liveRoots({ world: { mapId: 5, MAP_SHIPS: {} } }), 1234),
    null
  );
});

test("snapshot publisher emits immediately and on its 100 ms timer", () => {
  const messages = [];
  let scheduled;
  const windowRef = {
    postMessage(message) { messages.push(message); },
    setInterval(callback, delay) {
      scheduled = { callback, delay };
      return 9;
    }
  };

  const timerId = startSnapshotPublisher(
    windowRef,
    liveRoots(),
    100,
    () => 1234
  );

  assert.equal(timerId, 9);
  assert.equal(scheduled.delay, 100);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].direction, "snapshot");
  scheduled.callback();
  assert.equal(messages.length, 2);
});
