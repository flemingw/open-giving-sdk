# Open Giving

A TypeScript SDK that nonprofits can embed in their existing applications to
expose giving capabilities to AI agents through MCP and HTTP.

**Open Giving is software, not a giving service.** It registers no donors, holds
no funds, requires no database and operates no shared endpoint.

## The ownership boundary

```text
Agent ── MCP / HTTP ── Nonprofit application
                      ├─ Open Giving: contracts, validation, transport
                      └─ Nonprofit-owned adapter → existing application functions
                                                   needs / checkout / receipts
```

The nonprofit installs the libraries and implements its adapter in **its own
repository**. The adapter can call its public HTTP API or application functions;
an SDK-operated host is not required. Real API clients, endpoints, processor wiring,
credentials and deployment configuration do not belong in this repository.
An adopter that already has a suitable API/MCP need not add this SDK at all.

## Try it locally

```sh
npm ci --ignore-scripts
npm run check
npm run demo
```

Use Node.js 22 or newer. Tests and examples use fictional data only: no service
accounts, payment keys, database or nonprofit API access. The Node example binds
to loopback; the optional edge example is synthetic and read-only. Nothing deploys
on push. This is an experimental public alpha, not a verified payment integration.

For installation outside this workspace, see [the package guide](docs/INSTALL.md).
`npm run pack:sdk` produces one package with no unpublished workspace
dependencies. It can be embedded in an existing MCP endpoint using the shared
tool catalog; adopting the SDK does not require replacing that server.

## Smallest useful integration

Implement three functions: provider capabilities, search approved opportunities,
and get one opportunity. Use [the embedded fictional example](examples/embedded-provider/README.md)
to see how these connect to an application's own services without network calls.

Optional `prepare_gift` returns a pure review link without creating a session,
reservation or payment. Optional `prepare_checkout` delegates session preparation
to an existing provider function as an explicitly authorized write. A link or
session is not approval, a price lock or payment confirmation.

Quote, idempotent handoff and private-status interfaces are optional capabilities
for providers that already support them—not requirements to build new services.
The nonprofit/processor keeps payment approval, durable financial truth, receipts,
refunds and support. Agent preferences stay with the agent by default.

## Code map

| Location                      | Responsibility                                           |
| ----------------------------- | -------------------------------------------------------- |
| `packages/protocol`           | Runtime validation; generated JSON Schema/OpenAPI        |
| `packages/provider-sdk`       | Small read interface and optional giving interfaces      |
| `packages/server`             | Embeddable MCP/HTTP transport; injected authorization    |
| `packages/registry`           | In-process routing/allowlist, not a registration service |
| `packages/conformance`        | Provider diagnostics and opt-in contract checks          |
| `examples/embedded-provider`  | Fictional application-side function wiring               |
| `examples/reference-provider` | In-memory synthetic exact/partial test model             |
| `examples/node-connector`     | Optional synthetic loopback host                         |
| `examples/cloudflare-worker`  | Optional synthetic read-only edge host                   |

## Review and limits

Start with [the review guide](docs/REVIEW.md), [architecture](docs/ARCHITECTURE.md)
and [integration guide](docs/PROVIDER_INTEGRATION.md). The common interfaces use
explicit currencies and integer minor units, strict inputs, public projections,
scoped operations and safe errors. Provider-specific business rules stay with
the adopter. The SDK does not operate a donor account system or promise a global
cross-agent giving cap.

Tests exercise fictional providers with different currencies/funding models and
MCP/HTTP clients. They do not establish a real nonprofit's payment flow or any
agent platform's eligibility, native payments or directory approval. See
[testing evidence](docs/TESTING.md) and [release scope](docs/ROADMAP.md).

Apache-2.0. See [contributing](CONTRIBUTING.md) and [security](SECURITY.md).
Real provider deployment and live giving require provider approval and acceptance.
See [release and compatibility policy](docs/RELEASING.md) for the public-release gates.
