# Fictional nonprofit-side integration

This example belongs conceptually in an adopting nonprofit's repository. It
shows how its own application functions implement the SDK interface. It is not
a real provider client, network proxy, checkout service or deployment.

`src/index.ts` exports `createPantryAdapter(services)` for a fictional pantry.
Its existing data model uses local string IDs and whole-basket EUR funding;
the private notes field is intentionally never projected. Public descriptions
are explicitly approved application fields, not text anonymized by a regex.
Real adopters map their existing approved content and need no new approval schema.

The adopter supplies its own functions:

- `listTargets` and `getTarget` reuse its existing services.
- Optional `createSession` reuses existing checkout preparation. Without that
  function, no checkout method/capability is advertised.

The SDK's `GivingService` checks scope, input, provider identity, currency and
funding amount before calling a write. The backend must still validate current
terms, inventory and caller authority atomically: an SDK read cannot guarantee
the world has not changed. There is no automatic retry or payment confirmation.

Mount `createApplication` in the nonprofit's existing HTTPS application, with
the adopter's own grant verifier and routing allowlist. No new identity vendor,
database, SDK-hosted service or HTTP call back to the nonprofit is needed.
See [the full integration guide](../../docs/PROVIDER_INTEGRATION.md).

`tests/embedded-provider.test.mjs` and the multi-provider/client tests exercise
this compiled example with injected synthetic functions and no outbound fetch.
They do not establish real payment or platform acceptance.
