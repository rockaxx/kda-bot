const test = require("node:test");
const assert = require("node:assert/strict");
const {
  patchGameSource,
  summarizeRoot
} = require("../src/source-patch.js");

const marker = "const _0x416562='1.9.0.045';";
const roots =
  "let _0x229c50,_0x594165,_0x22a0bf,_0x1ceb4c,_0x429744,_0x607b9;" +
  "_0x429744['mapId'];_0x22a0bf['ship'];" +
  "_0x607b9['gamepadTargeter'];_0x229c50['initListeners'];";

const currentRoots =
  "let _0xc13e48,_0x313249,_0x3d592,_0x1e1267,_0x8541dd,_0x5d1a8d,_0x2e4b9e;" +
  "_0x8541dd['mapId'];_0x3d592['ship'];" +
  "_0x5d1a8d['gamepadTargeter'];_0xc13e48['initListeners'];" +
  "_0x1e1267['followX'];_0x313249['handleWriteLog'];" +
  "_0x2e4b9e['initiateConnection']();";

const latestRoots =
  "let _0x312959,_0x3154af,_0x4e6c8d,_0x1db4fd,_0x5608bd,_0x27bad5,_0x4bfb8d;" +
  "_0x27bad5['mapId'];_0x4e6c8d['ship'];" +
  "_0x4bfb8d['gamepadTargeter'];_0x312959['initListeners'];" +
  "_0x5608bd['followX'];_0x3154af['handleWriteLog'];" +
  "_0x1db4fd['initiateConnection']();" +
  "_0x27bad5['addEmpNew'];'instaShield';'tshield';_0x3154af['updatePremium'];";

test("patches only the recognized client fingerprint", () => {
  const result = patchGameSource(`${marker}${roots}`);

  assert.equal(result.status, "patched");
  assert.equal(result.version, "1.9.0.045");
  assert.match(result.source, /__SA_BOT_ROOTS__/);
  assert.match(result.source, /get world\(\).*_0x429744/s);
});

test("accepts a renamed version variable when the structural roots match", () => {
  const changedMarker = 'const _0xabcdef = "1.9.0.046";';
  const result = patchGameSource(`${changedMarker}${roots}`);

  assert.equal(result.status, "patched");
  assert.equal(result.version, "1.9.0.046");
  assert.match(result.source, /version:"1\.9\.0\.046"/);
});

test("patches current client with its exact seven root symbols", () => {
  const result = patchGameSource(
    `const _0xcurrent='1.9.0.051';${latestRoots}`
  );

  assert.equal(result.status, "patched");
  assert.equal(result.version, "1.9.0.051");
  assert.match(result.source, /get input\(\).*_0x312959/s);
  assert.match(result.source, /get ui\(\).*_0x3154af/s);
  assert.match(result.source, /get user\(\).*_0x4e6c8d/s);
  assert.match(result.source, /get camera\(\).*_0x5608bd/s);
  assert.match(result.source, /get world\(\).*_0x27bad5/s);
  assert.match(result.source, /get renderer\(\).*_0x4bfb8d/s);
  assert.match(result.source, /get network\(\).*_0x1db4fd/s);
});

test("uses the known current fingerprint version when source has no literal", () => {
  const result = patchGameSource(latestRoots);

  assert.equal(result.status, "patched");
  assert.equal(result.version, "1.9.0.051");
  assert.equal(result.reason, "recognized-structural-client");
  assert.match(result.source, /version:"1\.9\.0\.051"/);
});

test("rejects a current-like fingerprint without the mapped network root", () => {
  const withoutNetwork = latestRoots.replace(
    "_0x1db4fd['initiateConnection']();",
    ""
  );

  assert.equal(patchGameSource(withoutNetwork).status, "unsupported");
});

test("rejects a current-like fingerprint without required EMP and ISH semantics", () => {
  const withoutIsh = latestRoots.replace("'tshield';", "");
  const result = patchGameSource(withoutIsh);

  assert.equal(result.status, "unsupported");
  assert.equal(result.source, withoutIsh);
});

test("leaves ambiguous client fingerprints byte-identical", () => {
  const source = `${latestRoots}${currentRoots}`;
  const result = patchGameSource(source);

  assert.equal(result.status, "unsupported");
  assert.equal(result.source, source);
});

test("leaves unknown versions byte-identical", () => {
  const source = "const version='2.0.0';";
  const result = patchGameSource(source);

  assert.equal(result.status, "unsupported");
  assert.equal(result.source, source);
});

test("rejects incomplete and ambiguous fingerprints", () => {
  const incomplete = patchGameSource(marker);
  const duplicate = patchGameSource(`${marker}${roots}${marker}`);

  assert.equal(incomplete.status, "unsupported");
  assert.equal(duplicate.status, "unsupported");
});

test("sanitizes sensitive keys and limits depth", () => {
  const summary = summarizeRoot(
    {
      mapId: 7,
      token: "secret",
      child: { hp: 50, deep: { x: 1 } }
    },
    { maxDepth: 1, maxKeys: 20 }
  );

  assert.equal(summary.mapId, 7);
  assert.equal(Object.hasOwn(summary, "token"), false);
  assert.deepEqual(summary.child, { hp: 50, deep: "[depth-limit]" });
});

test("diagnostic summary never calls functions and catches throwing getters", () => {
  let called = false;
  const value = {
    action() {
      called = true;
    }
  };
  Object.defineProperty(value, "broken", {
    enumerable: true,
    get() {
      throw new Error("blocked");
    }
  });

  const summary = summarizeRoot(value, { maxDepth: 2, maxKeys: 20 });

  assert.equal(called, false);
  assert.equal(summary.action, "[function]");
  assert.equal(summary.broken, "[unavailable]");
});

test("diagnostic summary always produces JSON-safe primitive values", () => {
  const summary = summarizeRoot({
    missing: undefined,
    large: 123n,
    marker: Symbol("x"),
    invalidNumber: Number.NaN
  });

  assert.doesNotThrow(() => JSON.stringify(summary));
  assert.deepEqual(summary, {
    missing: "[undefined]",
    large: "[bigint]",
    marker: "[symbol]",
    invalidNumber: "[invalid-number]"
  });
});
