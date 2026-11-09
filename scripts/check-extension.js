const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8")
);
const errors = [];
const allowedPermissions = new Set(["storage"]);
const exactMatch = JSON.stringify([
  "https://steam.space-aces.com/gameNew*"
]);
const resourceMatch = JSON.stringify(["https://steam.space-aces.com/*"]);
const cKdaAsset = "assets/c-kda.gif";
const loadingAsset = "assets/besto.gif";
const loadingCss = "src/loading-screen.css";
const expectedScripts = {
  MAIN: [
    "src/namespace-main.js",
    "src/design-model-main.js",
    "src/source-patch.js",
    "src/page-adapter.js",
    "src/ckda-schema-main.js",
    "src/ckda-core-main.js",
    "src/design-main.js",
    "src/ckda-main.js"
  ],
  ISOLATED: [
    "src/loading-screen.js",
    "src/design-bootstrap.js",
    "src/namespace.js",
    "src/ckda-schema.js",
    "src/ckda-settings.js",
    "src/design-settings.js",
    "src/ckda-core.js",
    "src/ckda-bridge.js",
    "src/ckda-canvas.js",
    "src/schemas.js",
    "src/settings.js",
    "src/geometry.js",
    "src/planner.js",
    "src/controller.js",
    "src/logger.js",
    "src/bridge.js",
    "src/overlay.js",
    "src/runtime.js",
    "src/content.js"
  ]
};
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

for (const permission of manifest.permissions || []) {
  if (!allowedPermissions.has(permission)) {
    errors.push(`forbidden permission: ${permission}`);
  }
}

if ((manifest.host_permissions || []).length !== 0) {
  errors.push("host_permissions must be empty");
}

for (const entry of manifest.content_scripts || []) {
  if (JSON.stringify(entry.matches) !== exactMatch) {
    errors.push("unexpected content script match");
  }

  for (const file of entry.js || []) {
    if (/game(?:-dist)?\.js|\.env|logs|node_modules/i.test(file)) {
      errors.push(`forbidden path: ${file}`);
    }
    if (!fs.existsSync(path.join(root, file))) {
      errors.push(`missing script: ${file}`);
    }
  }
}

for (const [world, scripts] of Object.entries(expectedScripts)) {
  const entry = (manifest.content_scripts || []).find((item) => item.world === world);
  if (!entry || JSON.stringify(entry.js) !== JSON.stringify(scripts)) {
    errors.push(`unexpected ${world} script order`);
  }
}

const sharedWorldScripts = expectedScripts.MAIN.filter((script) =>
  expectedScripts.ISOLATED.includes(script)
);
if (sharedWorldScripts.length) {
  errors.push(`script paths shared across worlds: ${sharedWorldScripts.join(", ")}`);
}

const cKdaResource = (manifest.web_accessible_resources || []).find((entry) =>
  Array.isArray(entry.resources) && entry.resources.includes(cKdaAsset)
);
if (!cKdaResource || JSON.stringify(cKdaResource.matches) !== resourceMatch) {
  errors.push("missing origin-scoped C-KDA asset resource (WAR path must be /*)");
}

const cKdaAssetPath = path.join(root, cKdaAsset);
if (!fs.existsSync(cKdaAssetPath)) {
  errors.push("missing C-KDA asset");
} else {
  const asset = fs.readFileSync(cKdaAssetPath);
  const signature = asset.subarray(0, 6).toString("ascii");
  if (!new Set(["GIF87a", "GIF89a"]).has(signature)) {
    errors.push("invalid C-KDA GIF signature");
  }
  if (asset.byteLength !== 220122) {
    errors.push(`unexpected C-KDA GIF size: ${asset.byteLength}`);
  }
}

const isolatedEntry = (manifest.content_scripts || []).find((entry) => entry.world === "ISOLATED");
if (!isolatedEntry || !Array.isArray(isolatedEntry.css) || !isolatedEntry.css.includes(loadingCss)) {
  errors.push("missing loading-screen stylesheet");
}
const loadingResource = (manifest.web_accessible_resources || []).find((entry) =>
  Array.isArray(entry.resources) && entry.resources.includes(loadingAsset)
);
if (!loadingResource || JSON.stringify(loadingResource.matches) !== resourceMatch) {
  errors.push("missing origin-scoped loading GIF resource");
}
const loadingAssetPath = path.join(root, loadingAsset);
if (!fs.existsSync(loadingAssetPath)) {
  errors.push("missing loading GIF asset");
} else {
  const asset = fs.readFileSync(loadingAssetPath);
  if (!new Set(["GIF87a", "GIF89a"]).has(asset.subarray(0, 6).toString("ascii"))) {
    errors.push("invalid loading GIF signature");
  }
  if (asset.byteLength !== 12703381) {
    errors.push(`unexpected loading GIF size: ${asset.byteLength}`);
  }
}

const sourceDir = path.join(root, "src");
const maintainedSource = fs.readdirSync(sourceDir)
  .filter((name) => name.endsWith(".js"))
  .map((name) => fs.readFileSync(path.join(sourceDir, name), "utf8"))
  .join("\n");
if (!/CKDA_SUPPORTED_CLIENT_VERSION\s*=\s*["']1\.9\.0\.052["']/.test(maintainedSource)) {
  errors.push("missing supported C-KDA client version marker");
}
if (
  !/const CHANNEL\s*=\s*["']sa-bot-v1["']/.test(maintainedSource) ||
  !/const CKDA_CHANNEL\s*=\s*["']sa-ckda-v1["']/.test(maintainedSource)
) {
  errors.push("missing separate BOT/C-KDA channels");
}
for (const pattern of forbiddenGlobalHooks) {
  if (pattern.test(maintainedSource)) {
    errors.push(`forbidden platform hook: ${pattern}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("extension check passed: scripts, C-KDA asset, loading asset, version, channels, hook safety");
