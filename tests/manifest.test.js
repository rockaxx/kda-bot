const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("manifest is scoped to the game and has no sensitive permissions", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "manifest.json"), "utf8")
  );

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions || [], []);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(
    manifest.content_scripts.every(
      (entry) =>
        JSON.stringify(entry.matches) ===
        JSON.stringify(["https://steam.space-aces.com/gameNew*"])
    ),
    true
  );
  assert.equal(JSON.stringify(manifest).includes("game.js"), false);
  assert.equal(JSON.stringify(manifest).includes("cookies"), false);
  assert.equal(JSON.stringify(manifest).includes("webRequest"), false);
  assert.equal(
    manifest.content_scripts.every((entry) => entry.run_at === "document_start"),
    true,
    "both worlds must listen before the one-shot diagnostic"
  );
});

test("every declared script exists", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "manifest.json"), "utf8")
  );

  for (const entry of manifest.content_scripts) {
    for (const script of entry.js) {
      assert.equal(fs.existsSync(path.join(root, script)), true, script);
    }
  }
});

test("loads C-KDA contracts before their MAIN and isolated consumers", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "manifest.json"), "utf8")
  );
  const main = manifest.content_scripts.find((entry) => entry.world === "MAIN");
  const isolated = manifest.content_scripts.find(
    (entry) => entry.world === "ISOLATED"
  );

  assert.deepEqual(main.js, [
    "src/namespace-main.js",
    "src/source-patch.js",
    "src/page-adapter.js",
    "src/ckda-schema.js",
    "src/ckda-core.js",
    "src/ckda-main.js"
  ]);
  assert.deepEqual(isolated.js.slice(0, 4), [
    "src/namespace.js",
    "src/ckda-schema.js",
    "src/ckda-settings.js",
    "src/ckda-core.js"
  ]);
});
