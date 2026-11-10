(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.__SA_BOT_ISOLATED_V1__) Object.assign(root.__SA_BOT_ISOLATED_V1__, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";

  const TYPES = Object.freeze({
    "image/gif": [".gif"],
    "image/png": [".png"],
    "image/jpeg": [".jpg", ".jpeg"]
  });

  function validNameForType(name, mimeType) {
    const lower = typeof name === "string" ? name.toLowerCase() : "";
    return Boolean(TYPES[mimeType]?.some(extension => lower.endsWith(extension)));
  }

  function normalizeLoadingImage(value) {
    if (value === null || value === undefined) return { ok: true, value: null, errors: [] };
    const errors = [];
    const mimeType = value && typeof value === "object" ? value.mimeType : null;
    const name = value && typeof value === "object" ? value.name : null;
    const dataUrl = value && typeof value === "object" ? value.dataUrl : null;
    if (!validNameForType(name, mimeType)) errors.push("file must be GIF, PNG, or JPEG");
    const prefix = typeof mimeType === "string" ? `data:${mimeType};base64,` : "";
    if (typeof dataUrl !== "string" || !prefix || !dataUrl.startsWith(prefix) ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(dataUrl.slice(prefix.length))) {
      errors.push("image data is invalid");
    }
    return errors.length
      ? { ok: false, value: null, errors }
      : { ok: true, value: Object.freeze({ name, mimeType, dataUrl }), errors: [] };
  }

  function readLoadingImageFile(file, FileReaderCtor) {
    if (!file || !validNameForType(file.name, file.type) || typeof FileReaderCtor !== "function") {
      return Promise.reject(new TypeError("file must be GIF, PNG, or JPEG"));
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReaderCtor();
      reader.onerror = () => reject(new Error("image read failed"));
      reader.onload = () => {
        const normalized = normalizeLoadingImage({
          name: file.name, mimeType: file.type, dataUrl: reader.result
        });
        if (normalized.ok) resolve(normalized.value);
        else reject(new TypeError(normalized.errors.join("; ")));
      };
      reader.readAsDataURL(file);
    });
  }

  return { LOADING_IMAGE_TYPES: TYPES, normalizeLoadingImage, readLoadingImageFile };
});
