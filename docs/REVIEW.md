# Provider-neutral SDK review

## Scope and ownership

The SDK is embedded in a nonprofit's existing application. Real provider
adapters, endpoint clients, credentials, processor configuration and deployment
wiring belong in the nonprofit's repository. This repository contains only
reusable libraries, fictional examples and synthetic tests.

No donor signup, database, ledger, shared registry service, payment processor or
SDK-operated endpoint is required. Existing APIs/MCPs can remain as they are;
adoption is optional, not a reason to add another wrapper.

## Review order

1. [Adapter interfaces](../packages/provider-sdk/src/index.ts): three required
   reads; pure review links, session preparation, quotes and status are optional.
2. [Runtime contracts](../packages/protocol/src/index.ts): strict inputs, explicit
   currency/minor units and provider-scoped identities. Generated JSON Schema
   and OpenAPI must match the runtime schemas.
3. [Service validation](../packages/server/src/service.ts) and
   [transport](../packages/server/src/index.ts): host-supplied authorization,
   scope separation, consistent provider output, no inferred consent/success and
   no automatic financial retry. No provider-specific compatibility tools.
4. [Fictional embedded application](../examples/embedded-provider/src/index.ts):
   injection of existing functions without a provider HTTP client. Real adopters
   keep equivalent wiring in their own repositories.
5. [Boundary tests](../tests/sdk-boundary.test.mjs),
   [embedded tests](../tests/embedded-provider.test.mjs) and
   [multi-provider/client tests](../tests/multiple-providers-agents.test.mjs).

## Reproduce

```sh
npm ci --ignore-scripts
npm run check
npm run demo
```

Use Node.js 22+. No external credentials, application checkout, database,
processor account or nonprofit network access is needed. HTTP integration tests
use loopback; official MCP clients use the same embedded application handler.

## Limits

- A provider approves public content; field projection cannot certify text.
- A host verifies grants and owns production hosting/distributed abuse controls.
- The provider owns final terms, atomic inventory, idempotency, financial status,
  receipts, refunds and support. Read-before-write validation is not a price lock.
- Native agent payments, standing rules/budgets and directory eligibility need
  separate provider/platform acceptance. Synthetic tests do not establish them.
- Packages remain private. Package allowlists are not a complete repository
  history, licensing or security audit. Publication requires separate approval
  and source/history review.

See [architecture](ARCHITECTURE.md), [integration](PROVIDER_INTEGRATION.md) and
[testing](TESTING.md). Provider operational handoffs belong outside the SDK.
