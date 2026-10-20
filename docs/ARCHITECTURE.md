# Architecture

## The smallest useful boundary

The nonprofit embeds the SDK in its own application. The SDK validates and routes
agent requests to an adapter implemented in the nonprofit's repository; that
adapter invokes its public HTTP API or existing application functions. No SDK-operated service,
outbound nonprofit client, second backend or database is required.

| Concern                                                      | Owner              |
| ------------------------------------------------------------ | ------------------ |
| Types, validation, MCP/HTTP routing and conformance          | SDK                |
| Hosting, provider allowlist and endpoint authorization       | Adopting host      |
| Public-content approval, needs, checkout and financial truth | Nonprofit/provider |
| Preferences, savings context, suggestions and fresh approval | Agent and donor    |

Core packages depend only on the common contracts and transport libraries. The
transport never imports a concrete nonprofit adapter. Real integration code and
composition live in the adopter's repository; this repository includes fictional
examples only. [Boundary tests](../tests/sdk-boundary.test.mjs)
enforce the dependency direction and absence of database/account applications.

## Read, prepare, approve, confirm

1. Discovery returns allowlisted, provider-approved public opportunities.
2. `prepare_gift`, when supported, returns an exact-amount public review link.
   It does not reserve inventory, create a quote/session, charge or authorize.
3. The donor approves through the provider/platform's supported flow. Existing
   checkout and financial operations remain authoritative.
4. Optional private status uses host-supplied, gift/caller-scoped authorization.
   A URL, browser redirect or pending session does not establish payment success.

For backends that already support them, optional quote/handoff interfaces carry
exact terms and idempotency keys. They are not a requirement to build a separate
quote service, ledger or SDK database. No native agent payment is implemented by
returning a browser link.

Providers with an existing session-creation endpoint can implement optional
`prepareCheckout` instead. It requires discovery plus checkout-write scope and
fresh donor approval, and returns `expectedAmount`/`approval_required`, never a
locked price or successful contribution. It is not assumed idempotent. The SDK
does not fabricate quotes, private status, timestamps or a ledger to wrap it.

## Contracts and failure behavior

- Runtime Zod schemas are the source of truth for types and generated contracts.
- Money is a safe integer in minor units plus a currency; no implicit conversion.
- Provider-local IDs are scoped by provider ID. Exact and partial funding models
  are declared explicitly; a provider's financial rules stay in its adapter.
- Strict inputs reject private narrative, model-asserted approval and undeclared
  parameters. Output projection removes extra keys recursively. Text approval is
  still the provider's job: validation cannot recognize every private name.
- Provider errors are sanitized. The transport logs request ID, method, surface,
  timing and status—not credentials, request bodies or donor context.
- Provider callbacks are invoked once; uncertain financial operations are not
  automatically retried. The adopter owns any outbound clients, timeouts,
  redirect/destination policies, durable idempotency and cross-channel inventory.

## Host security, not SDK accounts

The host injects an authenticator and scopes. A principal is an opaque
host-authorized context; it may be a guest and need not be a registered donor.
Tool arguments never establish identity or consent. Discovery tokens must not
grant access to everyone's gifts. Optional JWT verification validates a host's
existing grant; it creates no accounts, token issuer or session database.

`ProviderRegistry` is an in-process map/allowlist. Its trust labels are host
configuration, not charity verification by Open Giving. Suspension and optional
host enablement policy are evaluated on operations. Sandbox entries must be
explicitly enabled. SDK installation does not establish platform eligibility.

Rate limiting and routing caches are per-process, ephemeral conveniences—not a
distributed abuse system or durable financial store. Production hosts supply
network policy, distributed limits, monitoring, secret handling and operational
ownership. No database schema or hosting vendor is prescribed.

## Deliberate scope

No donor signup, stored giving preferences, central nonprofit registration,
fund custody, SDK-operated checkout, payment ledger, mandatory identity provider,
background recovery service or dashboard. No global cross-agent monthly-cap
claim. Agent preferences guide suggestions; every gift still needs approval.

The reference provider stores synthetic state in memory solely to test contract
behavior. Its state resets on restart, URLs cannot accept money, and its test
confirmation helper is not exposed over HTTP or MCP.
