const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function runBrowserScript(context, relativePath) {
  vm.runInContext(
    fs.readFileSync(path.join(root, relativePath), "utf8"),
    context,
    { filename: relativePath }
  );
}

test("isolated modules initialize when page SABot is an undefined own property", () => {
  const pageWindow = { SABot: undefined };
  const context = vm.createContext({ window: pageWindow });

  runBrowserScript(context, "src/namespace.js");
  runBrowserScript(context, "src/schemas.js");

  assert.equal(
    pageWindow.__SA_BOT_ISOLATED_V1__.CHANNEL,
    "sa-bot-v1"
  );
});

test("main and isolated APIs use separate browser namespaces", () => {
  const pageWindow = {};
  const context = vm.createContext({ window: pageWindow });

  runBrowserScript(context, "src/namespace-main.js");
  runBrowserScript(context, "src/namespace.js");

  assert.notEqual(
    pageWindow.__SA_BOT_MAIN_V1__,
    pageWindow.__SA_BOT_ISOLATED_V1__
  );
});
