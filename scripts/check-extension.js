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

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("extension check passed");
