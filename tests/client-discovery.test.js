const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const api = require("../src/source-patch.js");

function client(prefix = "renamed", version = "next-build") {
  return `"use strict";
    const build = ${JSON.stringify(version)};
    let ${prefix}User, ${prefix}World, ${prefix}Net, ${prefix}Chat;
    let ${prefix}Camera, ${prefix}Input, ${prefix}Ui, ${prefix}Renderer;
    window.startGame = function () {
      ${prefix}User = {userID: 7, ship: {}, updatePremium() {}};
      ${prefix}World = {mapId: 1, MAP_SHIPS: new Map()};
      ${prefix}Net = {connected: true, sendPacket() {}, initiateConnection() {}, getHasSwitched() {}};
      // The live chat socket also has sendPacket; it must not win discovery.
      ${prefix}Chat = {connected: true, sendPacket() {}, initiateConnection() {}};
      ${prefix}Camera = {followX: 1, followY: 2};
      ${prefix}Input = {initListeners() {}};
      ${prefix}Ui = {handleWriteLog() {}};
      ${prefix}Renderer = {canvas: {}, gamepadTargeter: {}};
      return {user: ${prefix}User, world: ${prefix}World, network: ${prefix}Net,
        camera: ${prefix}Camera, input: ${prefix}Input, ui: ${prefix}Ui,
        renderer: ${prefix}Renderer};
    };
    window.replaceUser = function (user) { ${prefix}User = user; };
  `;
}

function execute(source) {
  const result = api.patchGameSource(source);
  assert.equal(result.status, "patched", result.reason);
  const window = {__SA_BOT_MAIN_V1__: api};
  vm.runInNewContext(result.source, {window});
  return window;
}

for (const prefix of ["first", "_0xabc123", "completelyDifferent"]) {
  test(`discovers renamed ${prefix} roots after delayed initialization without a version`, () => {
    const window = execute(client(prefix));
    assert.equal(window.__SA_BOT_ROOTS__, null);
    const expected = window.startGame();
    const roots = window.__SA_BOT_ROOTS__;
    assert.ok(roots);
    for (const [role, value] of Object.entries(expected)) assert.equal(roots[role], value, role);
    const nextUser = {userID: 8, ship: {}, updatePremium() {}};
    window.replaceUser(nextUser);
    assert.equal(roots.user, nextUser, "roots must track replacement objects");
  });
}

test("discovers lexical roots inside a strict IIFE", () => {
  const window = execute(`(() => {${client()}})();`);
  const expected = window.startGame();
  assert.equal(window.__SA_BOT_ROOTS__.world, expected.world);
});

test("does not mistake a chat connection for the game connection", () => {
  const window = execute(client().replace("sendPacket() {},", ""));
  window.startGame();
  assert.equal(window.__SA_BOT_ROOTS__, null);
});

test("does not guess when two distinct player objects match", () => {
  const source = client() + "let otherUser = {userID: 99, ship: {}};";
  const window = execute(source);
  window.startGame();
  assert.equal(window.__SA_BOT_ROOTS__, null);
});

test("detects ambiguity introduced after the first successful lookup", () => {
  let lateUser = null;
  const window = execute(client());
  window.startGame();
  api.registerClientCandidates(window, [() => lateUser]);
  assert.ok(window.__SA_BOT_ROOTS__);
  lateUser = {userID: 8, ship: {}};
  assert.equal(window.__SA_BOT_ROOTS__, null);
});

test("ignores property-looking text in strings and comments", () => {
  const source = `const note = "let fakeUser; fakeUser.ship; world.mapId; renderer.gamepadTargeter";
    // user.ship; world.MAP_SHIPS; input.initListeners
  `;
  const result = api.patchGameSource(source);
  assert.equal(result.status, "unsupported");
  assert.equal(result.source, source);
});

test("leaves malformed and unrelated JavaScript unchanged", () => {
  for (const source of ["const broken = ;", "window.answer = 42;"]) {
    const result = api.patchGameSource(source);
    assert.equal(result.status, "unsupported");
    assert.equal(result.source, source);
  }
});

test("repeated source registration and throwing getters do not break discovery", () => {
  const window = execute(client());
  window.startGame();
  const roots = window.__SA_BOT_ROOTS__;
  api.registerClientCandidates(window, [() => { throw new Error("TDZ"); }], "unknown");
  assert.equal(window.__SA_BOT_ROOTS__.user, roots.user);
});

test("bundled browser parser discovers roots without replacing the page parser", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const pageParser = { pageOwned: true };
  const context = vm.createContext({ acorn: pageParser });
  context.window = context;
  for (const file of ["namespace-main.js", "vendor/acorn.js", "source-patch.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", file), "utf8"), context);
  }
  assert.equal(context.acorn, pageParser);
  const result = context.__SA_BOT_MAIN_V1__.patchGameSource(client());
  assert.equal(result.status, "patched");
  vm.runInContext(result.source, context);
  const expected = context.startGame();
  assert.equal(context.__SA_BOT_ROOTS__.network, expected.network);
});
