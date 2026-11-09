const test = require("node:test");
const assert = require("node:assert/strict");

const { createRankOverride, rankAssetUrl } = require("../src/design-main.js");

function harness() {
  const frames = new Map();
  const children = [];
  let nextFrame = 0;
  const image = {
    style: {},
    isConnected: false,
    remove() {
      this.isConnected = false;
      const index = children.indexOf(this);
      if (index >= 0) children.splice(index, 1);
    }
  };
  const documentRef = {
    body: {
      appendChild(node) {
        children.push(node);
        node.isConnected = true;
      }
    },
    createElement(tag) {
      assert.equal(tag, "img");
      return image;
    }
  };
  const windowRef = {
    innerWidth: 1920,
    innerHeight: 1080,
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); }
  };
  const rankWrapper = {
    visible: true,
    toGlobal() { return { x: 321, y: 123 }; }
  };
  const roots = { user: { ship: { rankLogo: { wrapper: rankWrapper } } } };
  return {
    children, documentRef, frames, image, rankWrapper, roots, windowRef,
    tick() {
      const pending = [...frames.values()];
      frames.clear();
      for (const fn of pending) fn();
    }
  };
}

test("rank override loads exact unsmod rank asset and follows the hero rank logo", () => {
  const value = harness();
  const controller = createRankOverride({
    windowRef: value.windowRef,
    documentRef: value.documentRef,
    getRoots: () => value.roots
  });

  assert.equal(controller.setRank(20), true);
  assert.equal(value.image.src, "https://unsmod.eu/spacemap/ui/rank/20/0.png");
  assert.equal(value.rankWrapper.visible, true, "native rank stays until replacement loads");
  value.image.onload();
  value.tick();
  assert.equal(value.rankWrapper.visible, false);
  assert.equal(value.image.style.display, "block");
  assert.equal(value.image.style.left, "321px");
  assert.equal(value.image.style.top, "123px");
  assert.equal(value.image.style.pointerEvents, "none");
  controller.cleanup();
  assert.equal(value.rankWrapper.visible, true);
  assert.equal(value.image.isConnected, false);
});

test("rank override restores native rank on Default, load error, and root replacement", () => {
  const value = harness();
  const controller = createRankOverride({
    windowRef: value.windowRef,
    documentRef: value.documentRef,
    getRoots: () => value.roots
  });

  controller.setRank(7);
  value.image.onload();
  value.tick();
  assert.equal(value.rankWrapper.visible, false);
  controller.setRank(0);
  assert.equal(value.rankWrapper.visible, true);
  assert.equal(value.image.style.display, "none");

  controller.setRank(8);
  value.image.onerror();
  value.tick();
  assert.equal(value.rankWrapper.visible, true);
  assert.equal(value.image.style.display, "none");
  assert.equal(value.frames.size, 0, "failed image must not leave a redraw loop running");

  controller.setRank(9);
  value.image.onload();
  value.tick();
  const old = value.rankWrapper;
  const replacement = { visible: true, toGlobal: () => ({ x: 40, y: 50 }) };
  value.roots = { user: { ship: { rankLogo: { wrapper: replacement } } } };
  value.tick();
  assert.equal(old.visible, true);
  assert.equal(replacement.visible, false);
  assert.equal(value.image.style.left, "40px");
  assert.equal(value.image.style.top, "50px");
  controller.cleanup();
});

test("rank asset URL and setter reject invalid rank IDs", () => {
  const value = harness();
  const controller = createRankOverride({
    windowRef: value.windowRef,
    documentRef: value.documentRef,
    getRoots: () => value.roots
  });
  for (const invalid of [-1, 21, 1.5, "2", null]) {
    assert.equal(rankAssetUrl(invalid), null);
    assert.equal(controller.setRank(invalid), false);
  }
  controller.cleanup();
});

test("rank override falls back to current-client hero wrapper without hiding the ship", () => {
  const value = harness();
  delete value.roots.user.ship.rankLogo;
  value.roots.user.ship.wrapper = value.rankWrapper;
  const controller = createRankOverride({
    windowRef: value.windowRef,
    documentRef: value.documentRef,
    getRoots: () => value.roots
  });

  controller.setRank(19);
  value.image.onload();
  value.tick();
  assert.equal(value.image.style.display, "block");
  assert.equal(value.image.style.left, "321px");
  assert.equal(value.image.style.top, "75px");
  assert.equal(value.rankWrapper.visible, true, "fallback must never hide the full hero ship");
  controller.cleanup();
});
