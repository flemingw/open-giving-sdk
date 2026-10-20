# Testing and evidence

Run `npm ci --ignore-scripts`, `npm run check` and `npm run demo` on Node 22+.
All provider data is fictional. No real nonprofit endpoint, deployment, processor
key, donor, database or email account is used. Runtime network tests use loopback
only; independent package installation may fetch pinned npm dependencies.

## Coverage

- Money/currency, exact/partial funding, remaining-amount ranking, strict inputs,
  approved public field projection and consistent provider output.
- Host-injected scopes, guest/caller isolation, static-grant immutability,
  OAuth resource verification, safe errors/logs and request limits.
- Fictional application services injected directly into an adapter: unavailable/
  unapproved records are omitted, private fields never leave the application,
  optional checkout calls the existing function once with trusted caller context.
- Direct session preparation requires write scope and supported capability;
  malformed/private arguments, changed amounts and unsupported operations never
  reach the callback. Uncertain outcomes are not retried or reported as paid.
- Two independent fictional providers with colliding local IDs, EUR/exact and
  CAD/partial funding, and MCP/HTTP clients. No default currency conversion or
  nonprofit-specific server behavior is assumed.
- Synthetic quote ownership, conflicting/replayed requests, holds, expiry and
  scoped status model provider-owned financial semantics—not an SDK ledger.
- Runtime/generated contracts, dependency boundaries, restricted package exports,
  documentation links, formatting and high-confidence credential patterns.
- A fresh independent npm consumer installs the private SDK archive, executes
  tools and compiles TypeScript imports without workspace links. The standalone
  catalog retains strict inputs and safe errors for existing MCP transports.

The embedded example is compiled TypeScript, not an untested documentation snippet.
Tests forbid outbound fetch during its function calls. A boundary regression
rejects real-provider integration code or dependencies in the SDK tree and
keeps the optional CLI synthetic-only. Package surfaces contain built libraries
and protocol assets, not example apps or provider configuration.

## What these results do not establish

There is no real nonprofit or agent-platform payment acceptance claimed by this
repository. Separate provider projects must test their actual checkout,
authoritative status, signed webhooks, delivered receipts, uncertain/duplicate/
competing attempts, refunds and supported agent approval/completion.

Historic provider/prototype rehearsals and operational findings are maintained in
their separate private workspace, not mixed into reusable SDK documentation.
They do not certify this release. Static package/boundary checks are not charity
verification, independent security certification or universal agent compatibility.
