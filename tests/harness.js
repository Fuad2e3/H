/* A browser-shaped global so permissions.js can be exercised in Node.
   It touches only `window`, which is what makes it testable without a browser. */
globalThis.window = globalThis;
globalThis.loadFile = function (p) { (0, eval)(require('fs').readFileSync(p, 'utf8')); };
