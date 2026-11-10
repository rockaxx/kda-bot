const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isSupportedClientVersion,
  patchGameSource,
  summarizeRoot
} = require("../src/source-patch.js");

test("runtime version gate accepts future four-part builds only", () => {
  assert.equal(isSupportedClientVersion("n1.9.0.7777"), true);
  assert.equal(isSupportedClientVersion("future"), false);
  assert.equal(isSupportedClientVersion("1.9.0"), false);
});

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

const nextRoots =
  "let _0x29d06a,_0x3ce5a6,_0x13411e,_0x3a7293,_0xa7de8f,_0x1bdc1e,_0x456f25;" +
  "_0x1bdc1e['mapId'];_0x13411e['ship'];" +
  "_0x456f25['gamepadTargeter'];_0x29d06a['initListeners'];" +
  "_0xa7de8f['followX'];_0x3ce5a6['handleWriteLog'];" +
  "_0x3a7293['initiateConnection']();" +
  "_0x1bdc1e['addEmpNew'];'instaShield';'tshield';_0x13411e['updatePremium'];";

const current0996Roots =
  "let _0x30ad6d,_0x598486,_0x4086e3,_0x6d416c,_0x37fa46,_0x38052d,_0x5977d3;" +
  "_0x38052d['mapId'];_0x4086e3['ship'];" +
  "_0x5977d3['gamepadTargeter'];_0x30ad6d['initListeners'];" +
  "_0x37fa46['followX'];_0x598486['handleWriteLog'];" +
  "_0x6d416c['initiateConnection']();" +
  "_0x38052d['addEmpNew'];'instaShield';'tshield';_0x4086e3['updatePremium'];";

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

test("patches 1.9.0.052 with its exact seven root symbols", () => {
  const result = patchGameSource(
    `const _0xcurrent='1.9.0.052';${nextRoots}`
  );

  assert.equal(result.status, "patched");
  assert.equal(result.version, "1.9.0.052");
  assert.match(result.source, /get input\(\).*_0x29d06a/s);
  assert.match(result.source, /get ui\(\).*_0x3ce5a6/s);
  assert.match(result.source, /get user\(\).*_0x13411e/s);
  assert.match(result.source, /get network\(\).*_0x3a7293/s);
  assert.match(result.source, /get camera\(\).*_0xa7de8f/s);
  assert.match(result.source, /get world\(\).*_0x1bdc1e/s);
  assert.match(result.source, /get renderer\(\).*_0x456f25/s);
});

test("patches live 1.9.0.0996 with its exact seven root symbols", () => {
  const result = patchGameSource(
    `const _0xcurrent='1.9.0.0996';${current0996Roots}`
  );

  assert.equal(result.status, "patched");
  assert.equal(result.version, "1.9.0.0996");
  assert.match(result.source, /get input\(\).*_0x30ad6d/s);
  assert.match(result.source, /get ui\(\).*_0x598486/s);
  assert.match(result.source, /get user\(\).*_0x4086e3/s);
  assert.match(result.source, /get network\(\).*_0x6d416c/s);
  assert.match(result.source, /get camera\(\).*_0x37fa46/s);
  assert.match(result.source, /get world\(\).*_0x38052d/s);
  assert.match(result.source, /get renderer\(\).*_0x5977d3/s);
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
