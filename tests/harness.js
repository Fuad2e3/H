/* Minimal browser-shaped globals so the logic files can be exercised in Node.
   store.js and permissions.js touch only window and localStorage, which is
   what makes them testable without a browser at all. */
globalThis.window = globalThis;
var mem = {};
globalThis.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
  setItem: function (k, v) { mem[k] = String(v); },
  removeItem: function (k) { delete mem[k]; }
};
globalThis.loadFile = function (p) { (0, eval)(require('fs').readFileSync(p, 'utf8')); };
