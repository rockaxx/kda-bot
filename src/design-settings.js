(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.__SA_BOT_ISOLATED_V1__, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  const LEGACY_MODELS = Object.freeze({
    enforcer: 1, bastion: 2, goliath: 14, veteran: 17, exalted: 18,
    goal: 19, kick: 20, referee: 21, surgeon: 31, vanquisher: 78,
    sovereign: 79, peacemaker: 80, saturn: 81, bronze: 91, silver: 92,
    gold: 93, crimson: 95, frost: 128, ignite: 133, "plus-carbonite": 181,
    iron: 216, regalia: 218
  });
  // UNS paths mix descriptive names and abbreviated legacy asset names.
  const SHIP_FAMILIES = [
    ["Goliath", /goliath|^goldGoli$/i, [22, 28, 82, 83, 94, 107, 115, 119, 120, 121, 122, 123, 135, 136, 139, 140, 144, 145, 164, 173, 175, 180, 187, 194, 198, 199, 200, 201, 202, 203, 204, 205, 224, 225, 226, 227, 228, 229, 230, 231, 240, 241, 243, 250]],
    ["Vengeance", /vengeance|^lightning|^goldVeng$/i, [110, 111, 112, 185, 186, 235, 236, 242]],
    ["N-Starhawk", /starhawk|^nostromo.?(ambassador|regalia)/i, [249]],
    ["Nostromo", /nostromo/i, []],
    ["Sentinel", /sentinel/i, []],
    ["Spectrum", /spectrum/i, []],
    ["Solace", /solace/i, []],
    ["Diminisher", /diminish/i, []],
    ["Venom", /venom/i, []],
    ["Phoenix", /phoenix/i, []],
    ["Aegis", /aegis/i, []],
    ["Citadel", /citadel|^citaSpooky$/i, []],
    ["Spearhead", /spearhead/i, []],
    ["Warden", /warden/i, []],
    ["Seraph", /seraph/i, []],
    ["Leonov", /leonov|^leolove$/i, []],
    ["Cyborg", /cyborg/i, []],
    ["Pusat", /pusat/i, []],
    ["Tartarus", /tartarus/i, []]
  ];

  function createShipCatalog(models) {
    return Object.entries(models || {}).flatMap(([id, model]) => {
      if (!/^[1-9]\d{0,8}$/.test(id) || typeof model?.path !== "string" || !model.path) return [];
      const basename = model.path.split("/").at(-1).replace(/^ship_/, "");
      const category = model.path.startsWith("ships/")
        ? SHIP_FAMILIES.find(([, pattern, ids]) => pattern.test(basename) || ids.includes(Number(id)))?.[0]
        : null;
      const name = basename.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ").replace(/\b[a-z]/g, letter => letter.toUpperCase());
      return [{ value: "model:" + id, label: name + " #" + id, category: category || "Other" }];
    }).sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }));
  }
  const DESIGN_DEFAULT_SETTINGS = Object.freeze({
    rankId: 0, ringLevel: 0, shipDesign: "default", titleText: "", titleColor: "#ffd700"
  });

  function normalizeDesignSettings(value = {}, catalog = []) {
    const source = value && typeof value === "object" ? value : {};
    const output = { ...DESIGN_DEFAULT_SETTINGS };
    const errors = [];
    if (Object.prototype.hasOwnProperty.call(source, "rankId")) {
      if (Number.isInteger(source.rankId) && source.rankId >= 0 && source.rankId <= 20) {
        output.rankId = source.rankId;
      } else {
        errors.push("rankId must be an integer from 0 to 20");
      }
    }
    if (Object.hasOwn(source, "ringLevel")) {
      if (Number.isInteger(source.ringLevel) && source.ringLevel >= 0 && source.ringLevel <= 7) {
        output.ringLevel = source.ringLevel;
      } else {
        errors.push("ringLevel must be an integer from 0 to 7");
      }
    }
    if (Object.prototype.hasOwnProperty.call(source, "shipDesign")) {
      const raw = source.shipDesign;
      const shipDesign = typeof raw === "string" && Object.hasOwn(LEGACY_MODELS, raw)
        ? "model:" + LEGACY_MODELS[raw]
        : raw;
      if (shipDesign === "default" || catalog.some(entry => entry.value === shipDesign)) {
        output.shipDesign = shipDesign;
      } else {
        errors.push("shipDesign is invalid");
      }
    }
    if (Object.hasOwn(source, "titleText")) {
      const titleText = typeof source.titleText === "string" ? source.titleText.trim() : null;
      if (titleText !== null && titleText.length <= 40 && !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(titleText)) {
        output.titleText = titleText;
      } else {
        errors.push("titleText must be a single line of up to 40 characters");
      }
    }
    if (Object.hasOwn(source, "titleColor")) {
      if (typeof source.titleColor === "string" && /^#[0-9a-f]{6}$/i.test(source.titleColor)) {
        output.titleColor = source.titleColor.toLowerCase();
      } else {
        errors.push("titleColor must be a hex RGB colour");
      }
    }
    return {
      ok: errors.length === 0,
      errors,
      value: Object.freeze(output)
    };
  }

  return { DESIGN_DEFAULT_SETTINGS, createShipCatalog, normalizeDesignSettings };
});
