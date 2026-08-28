"use strict";

if (!Object.prototype.hasOwnProperty.call(window, "SABot")) {
  Object.defineProperty(window, "SABot", {
    value: Object.create(null),
    configurable: false,
    enumerable: false,
    writable: false
  });
}
