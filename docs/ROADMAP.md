# SDK release scope

## Included

- Runtime contracts, generated JSON Schema/OpenAPI and strict TypeScript types.
- Three-read adapter interface and optional pure-link, session, quote and status
  capabilities for an adopter's existing functionality.
- Embeddable MCP/HTTP routing with injected authorization and safe errors.
- In-process provider routing/allowlist, not a shared registration service.
- Fictional function-injection, exact/partial and host examples with synthetic
  multi-provider/client tests. No real provider clients or hosting configuration.
- Reproducible contract, package, architecture and documentation checks.

## Before public release

1. Independent API/security review under the [compatibility policy](RELEASING.md).
2. Licensing/source-history review and public release metadata. Independent
   package installation is exercised by the consumer test, not yet npm-published.
3. Private security reporting and maintenance ownership ready for public use.
4. Explicit owner approval before visibility changes or package publication.

## Provider acceptance is separate

Nonprofits own their adapters and hosting in their own repositories. Validate
real integrations there, including payment, status, receipts, refunds, support
and agent-platform eligibility. No successful real adopter or native agent
payment is implied by the SDK's fictional examples. A provider that already
has a suitable API/MCP need not adopt another layer to launch.
