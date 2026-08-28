(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) Object.assign(root.SABot, api);
})(typeof window === "object" ? window : null, function createApi() {
  "use strict";
  return {};
});
