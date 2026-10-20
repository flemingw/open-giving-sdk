# Integrate an existing nonprofit

## 1. Implement the three reads

Install the SDK libraries in the nonprofit's existing application. Write and
maintain its adapter in that application's repository, not in Open Giving.
Call the application's own services directly; no HTTP client back to itself,
second backend or separate connector host is required. The
[fictional embedded example](../examples/embedded-provider/README.md) is compiled
and tested and illustrates this ownership boundary.

Implement `ReadonlyProviderAdapter` from `@open-giving/provider-sdk`:

- `getProvider()` declares identity, currencies, funding models and capabilities.
- `searchOpportunities(query)` returns currently available approved public data.
- `getOpportunity(id)` returns the same public projection, or null.

Use integer minor units, explicit currencies, coarse location and provider-scoped
IDs. Do not return private case stories, names, addresses or photos. Only map
content the nonprofit has approved for agents. Never silently fall back to a
broader website profile when curated data is unavailable.

## 2. Embed in the nonprofit's host

```ts
import { GivingService, createApplication } from "@open-giving/server";
import { ProviderRegistry } from "@open-giving/registry";

const application = createApplication({
  publicOrigin: nonprofitConnectorOrigin,
  authenticate: verifyHostGrant,
  service: new GivingService(
    new ProviderRegistry([
      { id: nonprofitId, adapter, verification: hostApprovedTrustState },
    ]),
  ),
});
// Mount application.fetch in the chosen HTTPS host; close it on shutdown.
```

The adapter, host origin, trust state and verifier are supplied by the adopter. There is
no shared Open Giving endpoint or signup. `verifyHostGrant` returns an opaque
principal/client/scopes or null. It can validate an existing backend credential
or a narrowly scoped guest grant. Do not share one all-powerful donor credential.
Use sandbox trust only in explicitly approved test environments.

See [local development](LOCAL_DEVELOPMENT.md) for runnable hosts and HTTP routes.

## 3. Prefer a pure review link when possible

Optional `prepareGift(input)` returns `review_required`, exact amount, recipient
reference, disclosure and HTTPS review URL. It must perform no writes,
reservations, session creation or payment. The provider then handles approval
and checkout through its existing system. Native agent completion is a separate
platform integration, not a capability inferred from an HTTPS URL.

Keep source attribution in trusted host configuration. Do not accept savings
reasons, bank/email content or a model's `approved: true` as donation authority.

## 4. Reuse existing session creation, status and transactions only when supported

Optional `prepareCheckout(input, context)` delegates to the adopter's existing session-creation function
without requiring quotes. Declare `capabilities.checkoutPreparation=true`.
It is state-changing, needs discovery and checkout-write scopes and fresh donor
approval, and must not retry ambiguous outcomes. Return the expected amount,
validated provider checkout URL and `approval_required`, not a locked total or a
paid gift. The provider/platform obtains final payment approval. Do not substitute
this write for pure `prepareGift`, or advertise native completion from a URL.

`getContributionStatus(id, context)` must validate caller/gift authority at the
provider. An opaque ID alone is not permission. Discovery credentials must not
authorize private status. Return `confirmed` only from provider-confirmed facts.

Optional `quoteContribution` and `createCheckoutSession` adapt existing backend
capabilities. Quotes bind recipient, amount, fees, total, terms and expiry.
Handoffs preserve provider-owned idempotency and return pending/approval-required,
never fabricate confirmation. Do not build a second ledger to implement an SDK
interface. Unsupported methods remain absent; unsupported requests fail closed.

The provider owns cross-channel inventory, processor reconciliation, receipts,
refunds, reporting and support. Recovery must reuse the original attempt, not
blindly create a new payment when the outcome is uncertain.

## 5. Test the real boundary

Run `diagnoseProvider` for read-only wiring checks, then `checkReadonlyProvider`.
These are not charity verification or payment-safety certification. The mutating
conformance helper requires an explicitly approved synthetic sandbox fixture.

Test changed/withdrawn opportunities, exact/partial amounts, private fields,
authorization isolation, stale terms, duplicate/conflicting requests, interrupted
payment and authoritative status. Production approval requires the actual
provider checkout, signed webhooks, delivered receipts and supported agent flow.
Mocked tests do not establish those integrations.
