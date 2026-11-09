const test = require("node:test");
const assert = require("node:assert/strict");

const { publishDesignBootstrap } = require("../src/design-bootstrap.js");

test("bootstrap publishes persisted ship design before normal content startup", async () => {
  const messages = [];
  const windowRef = { postMessage(message) { messages.push(message); } };
  const storageArea = {
    get(keys, callback) {
      assert.deepEqual(keys, ["designSettings"]);
      callback({ designSettings: { shipDesign: "bastion" } });
    }
  };
  await publishDesignBootstrap({ windowRef, storageArea });
  assert.deepEqual(messages, [{ channel: "sa-design-bootstrap-v1", shipDesign: "bastion" }]);
});

test("bootstrap fails closed to default design", async () => {
  const messages = [];
  await publishDesignBootstrap({
    windowRef: { postMessage(message) { messages.push(message); } },
    storageArea: { get(_keys, callback) { callback({ designSettings: { shipDesign: "unknown" } }); } }
  });
  assert.equal(messages[0].shipDesign, "default");
});
