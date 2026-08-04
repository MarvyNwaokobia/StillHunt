// Stub for @x402/* — the payments SDK reached only through a wagmi connector
// StillHunt never constructs (baseAccount, pulled in by the connectors barrel).
//
// CommonJS on purpose. An ESM stub is statically analysable, so webpack checks
// every named import against it and fails on the first one that is missing —
// and the set of names that SDK imports is whatever it happens to import today.
// A CJS module with a Proxy answers any name, and webpack does not verify it.
//
// Every property is a no-op function. Nothing here is ever called: the code path
// requires the Base account connector, which this app does not wire up.
module.exports = new Proxy(
  {},
  {
    get: (_t, prop) => (prop === '__esModule' ? false : () => undefined),
  },
)
