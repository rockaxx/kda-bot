(function expose(root, factory) {
  const parser = typeof module === "object" && module.exports
    ? require("./vendor/acorn.js") : {parse: root.__SA_BOT_MAIN_V1__.parseJavaScript};
  const api = factory(parser);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_MAIN_V1__, api);
})(typeof window === "object" ? window : null, function createApi(parser) {
  "use strict";

  const SENSITIVE_KEY = /token|cookie|session|auth|password|email|chat|message|payload|socket|credential/i;
  const registries = new WeakMap();
  const methods = (value, names) => names.every(name => typeof value[name] === "function");
  const roles = {
    user: value => value.ship && typeof value.ship === "object" &&
      (typeof value.userID === "string" || Number.isFinite(value.userID)),
    world: value => value.MAP_SHIPS && methods(value.MAP_SHIPS, ["forEach", "get"]) &&
      Number.isFinite(Number(value.mapId)),
    network: value => typeof value.connected === "boolean" &&
      // Chat shares sendPacket/initiateConnection; game networking also handles map-server switches.
      methods(value, ["initiateConnection", "sendPacket", "getHasSwitched"]),
    camera: value => Number.isFinite(value.followX) && Number.isFinite(value.followY),
    input: value => methods(value, ["initListeners"]),
    ui: value => methods(value, ["handleWriteLog"]),
    renderer: value => value.canvas && "gamepadTargeter" in value
  };

  function registerClientCandidates(windowRef, readers, version = "unknown") {
    if (!windowRef || !Array.isArray(readers)) return;
    let registry = registries.get(windowRef);
    if (!registry) {
      registry = { readers: [], version, roots: {} };
      function read(reader, role) {
        try {
          const value = reader();
          return value && typeof value === "object" && roles[role](value) ? value : null;
        } catch (_) { return null; }
      }
      function locate(role) {
        let found = null;
        for (const candidate of registry.readers) {
          const value = read(candidate, role);
          if (!value) continue;
          if (found && found !== value) return null;
          found = value;
        }
        return found;
      }
      for (const role of Object.keys(roles)) {
        Object.defineProperty(registry.roots, role, { enumerable: true, get: () => locate(role) });
      }
      Object.defineProperty(registry.roots, "version", { enumerable: true, get: () => registry.version });
      Object.freeze(registry.roots);
      Object.defineProperty(windowRef, "__SA_BOT_ROOTS__", {
        configurable: true,
        get() {
          return locate("user") && locate("world") && locate("network") ? registry.roots : null;
        }
      });
      registries.set(windowRef, registry);
    }
    registry.readers.push(...readers.filter(reader => typeof reader === "function"));
    if (version !== "unknown") registry.version = version;
  }

  function unsupported(source, reason) {
    return {status: "unsupported", source, version: null, reason};
  }

  function walk(node, visit) {
    if (!node || typeof node.type !== "string") return;
    visit(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => walk(child, visit));
      else if (value && typeof value.type === "string") walk(value, visit);
    }
  }

  function bindingNames(pattern, names) {
    if (!pattern) return;
    if (pattern.type === "Identifier") names.add(pattern.name);
    else if (pattern.type === "RestElement") bindingNames(pattern.argument, names);
    else if (pattern.type === "AssignmentPattern") bindingNames(pattern.left, names);
    else if (pattern.type === "ObjectPattern") pattern.properties.forEach(p => bindingNames(p.value || p.argument, names));
    else if (pattern.type === "ArrayPattern") pattern.elements.forEach(p => bindingNames(p, names));
  }

  function patchGameSource(source) {
    if (typeof source !== "string") return unsupported(source, "not-text");
    let tree;
    try { tree = parser.parse(source, {ecmaVersion: "latest", sourceType: "script"}); }
    catch (_) { return unsupported(source, "client-parse-failed"); }
    const scopes = [tree];
    // Capture closures in immediately invoked bundles as well as top-level scripts.
    walk(tree, node => {
      if (node.type !== "CallExpression") return;
      const callee = node.callee.type === "MemberExpression" ? node.callee.object : node.callee;
      if (["FunctionExpression", "ArrowFunctionExpression"].includes(callee.type) &&
          callee.body.type === "BlockStatement") scopes.push(callee.body);
    });
    const edits = [];
    let version = "unknown";
    for (const scope of scopes) {
      const names = new Set();
      const properties = new Set();
      for (const statement of scope.body) {
        if (statement.type !== "VariableDeclaration") continue;
        for (const declaration of statement.declarations) {
          bindingNames(declaration.id, names);
          if (declaration.init?.type === "Literal" && typeof declaration.init.value === "string" &&
              /^\d+(?:\.\d+){3}$/.test(declaration.init.value)) version = declaration.init.value;
        }
      }
      walk(scope, node => {
        const key = node.type === "MemberExpression" ? node.property :
          ["Property", "MethodDefinition", "PropertyDefinition"].includes(node.type) ? node.key : null;
        if (key?.type === "Literal") properties.add(key.value);
        else if (key?.type === "Identifier" && !node.computed) properties.add(key.name);
      });
      // Only instrument a game-shaped scope; runtime capabilities choose its objects.
      if (names.size < 2 || !properties.has("ship") ||
          !(properties.has("mapId") || properties.has("MAP_SHIPS")) ||
          !(properties.has("initListeners") || properties.has("gamepadTargeter"))) continue;
      let position = scope.type === "Program" ? (tree.start || 0) : scope.start + 1;
      for (const statement of scope.body) {
        if (!statement.directive) break;
        position = statement.end;
      }
      const readers = [...names].map(name => "()=>" + name).join(",");
      edits.push({position, readers});
    }
    if (!edits.length) return unsupported(source, "game-scope-not-found");
    let patched = source;
    for (const {position, readers} of edits.sort((a, b) => b.position - a.position)) {
      const exposure = ';window.__SA_BOT_MAIN_V1__.registerClientCandidates(window,[' + readers + '],' + JSON.stringify(version) + ');';
      patched = patched.slice(0, position) + exposure + patched.slice(position);
    }
    return {status: "patched", source: patched, version, reason: "capability-discovery"};
  }

  function summarizeRoot(value, options) {
    const config = options || {};
    const maxDepth = Number.isInteger(config.maxDepth) ? config.maxDepth : 2;
    const maxKeys = Number.isInteger(config.maxKeys) ? config.maxKeys : 100;
    const seen = new WeakSet();
    let keyCount = 0;

    function visit(current, depth) {
      if (current === undefined) return "[undefined]";
      if (typeof current === "function") return "[function]";
      if (typeof current === "bigint") return "[bigint]";
      if (typeof current === "symbol") return "[symbol]";
      if (typeof current === "number" && !Number.isFinite(current)) {
        return "[invalid-number]";
      }
      if (current === null || typeof current !== "object") return current;
      if (depth > maxDepth) return "[depth-limit]";
      if (seen.has(current)) return "[circular]";
      seen.add(current);

      const output = Array.isArray(current) ? [] : {};
      let keys;
      try {
        keys = Object.keys(current);
      } catch (_) {
        return "[unavailable]";
      }
      for (const key of keys) {
        if (keyCount >= maxKeys) break;
        if (SENSITIVE_KEY.test(key)) continue;
        keyCount += 1;
        try {
          output[key] = visit(current[key], depth + 1);
        } catch (_) {
          output[key] = "[unavailable]";
        }
      }
      return output;
    }

    return visit(value, 0);
  }

  return { patchGameSource, registerClientCandidates, summarizeRoot };
});
