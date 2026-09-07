const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const cKdaAsset = "assets/c-kda.gif";
const forbiddenGlobalHooks = [
  /JSON\.parse\s*=/,
  /Response\.prototype\.json\s*=/,
  /Object\.defineProperty\s*=/,
  /Reflect\.defineProperty\s*=/,
  /window\.Function\s*=/,
  /Object\.defineProperty\s*\(\s*JSON\s*,\s*["']parse["']/,
  /Object\.defineProperty\s*\(\s*Response\.prototype\s*,\s*["']json["']/,
  /Object\.defineProperty\s*\(\s*Object\s*,\s*["']defineProperty["']/,
  /Object\.defineProperty\s*\(\s*Reflect\s*,\s*["']defineProperty["']/,
  /Object\.defineProperty\s*\(\s*window\s*,\s*["']Function["']/
];

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

test("packages the local C-KDA GIF with Chrome-valid origin-scoped resource matches", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "manifest.json"), "utf8")
  );
  const resource = (manifest.web_accessible_resources || []).find((entry) =>
    Array.isArray(entry.resources) && entry.resources.includes(cKdaAsset)
  );

  assert.ok(resource, "C-KDA GIF must be declared as a web-accessible resource");
  assert.deepEqual(resource.matches, ["https://steam.space-aces.com/*"]);
});

function checkManifest(manifest) {
  const errors = [];
  let exitCode = 0;
  vm.runInNewContext(fs.readFileSync(path.join(root, "scripts/check-extension.js"), "utf8"), {
    __dirname: path.join(root, "scripts"),
    require(name) {
      if (name !== "node:fs") return require(name);
      return { ...fs, readFileSync(file, ...args) {
        return file === path.join(root, "manifest.json")
          ? JSON.stringify(manifest) : fs.readFileSync(file, ...args);
      } };
    },
    console: { log() {}, error(value) { errors.push(value); } },
    process: { exit(code) { exitCode = code; } }
  });
  return { exitCode, errors: errors.join("\n") };
}

test("checker rejects gameNew WAR paths while accepting the origin wildcard", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  manifest.web_accessible_resources[0].matches = ["https://steam.space-aces.com/gameNew*"];
  assert.equal(checkManifest(manifest).exitCode, 1, "Chrome rejects a WAR path other than /*");
  manifest.web_accessible_resources[0].matches = ["https://steam.space-aces.com/*"];
  assert.deepEqual(checkManifest(manifest), { exitCode: 0, errors: "" });
  for (const script of manifest.content_scripts) {
    script.matches = ["https://steam.space-aces.com/*"];
    assert.match(checkManifest(manifest).errors, /unexpected content script match/);
    script.matches = ["https://steam.space-aces.com/gameNew*"];
  }
});

test("packages the validated C-KDA GIF binary", () => {
  const asset = fs.readFileSync(path.join(root, cKdaAsset));

  assert.equal(asset.byteLength, 220122);
  assert.equal(["GIF87a", "GIF89a"].includes(asset.subarray(0, 6).toString("ascii")), true);
});

test("maintained extension source does not install broad global hooks", () => {
  const sourceDir = path.join(root, "src");
  const source = fs.readdirSync(sourceDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => fs.readFileSync(path.join(sourceDir, name), "utf8"))
    .join("\n");

  for (const pattern of forbiddenGlobalHooks) {
    assert.equal(pattern.test(source), false, `forbidden platform hook: ${pattern}`);
  }
});

test("extension checker reports C-KDA package safety checks", () => {
  const output = childProcess.execFileSync(
    process.execPath,
    ["scripts/check-extension.js"],
    { cwd: root, encoding: "utf8" }
  );

  assert.match(output, /C-KDA asset/i);
  assert.match(output, /extension check passed/i);
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
    "src/ckda-schema-main.js",
    "src/ckda-core-main.js",
    "src/ckda-main.js"
  ]);
  assert.deepEqual(isolated.js.slice(0, 6), [
    "src/namespace.js",
    "src/ckda-schema.js",
    "src/ckda-settings.js",
    "src/ckda-core.js",
    "src/ckda-bridge.js",
    "src/ckda-canvas.js"
  ]);
  assert.ok(isolated.js.indexOf("src/ckda-canvas.js") < isolated.js.indexOf("src/overlay.js"));
  assert.ok(isolated.js.indexOf("src/ckda-bridge.js") < isolated.js.indexOf("src/content.js"));
});

test("MAIN and ISOLATED worlds never register the same script path", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "manifest.json"), "utf8")
  );
  const main = manifest.content_scripts.find((entry) => entry.world === "MAIN");
  const isolated = manifest.content_scripts.find((entry) => entry.world === "ISOLATED");
  const overlap = main.js.filter((script) => isolated.js.includes(script));

  assert.deepEqual(overlap, []);
});
