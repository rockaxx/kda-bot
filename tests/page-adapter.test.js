const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createPatchedBlobConstructor,
  publishDiagnostic
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
