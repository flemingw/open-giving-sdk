# Local development

Use Node.js 22 or newer. From a fresh checkout:

```sh
npm ci --ignore-scripts
npm run check
npm run demo
```

The check builds strict TypeScript, runs offline synthetic tests, checks generated
contracts and documentation links, verifies formatting and scans tracked source
for high-confidence credential patterns. It needs no external credentials or
database. `npm run contracts` regenerates wire contracts after schema changes.

## Optional loopback host

Copy `.env.example` to ignored `.env` and replace the service-token placeholder
with a unique random value of at least 32 characters. Run `npm start`. The Node
example binds to `127.0.0.1:3001`; this is a developer host, not production donor
authorization. Never put credentials in URLs or model transcripts.

| Route                                             | Purpose                                  |
| ------------------------------------------------- | ---------------------------------------- |
| `/healthz`                                        | Liveness/version, no authentication      |
| `/mcp`                                            | MCP tools using the verified host scopes |
| `/api/v1/providers`                               | Enabled provider identities/capabilities |
| `/api/v1/opportunities`                           | Filtered, paged public opportunities     |
| `/api/v1/providers/:providerId/opportunities/:id` | One public opportunity                   |
| `/api/v1/gift-preparations`                       | Pure review-link preparation             |
| `/api/v1/checkout-preparations`                   | Optional state-changing session creation |
| `/api/v1/quotes`                                  | Optional provider quote                  |
| `/api/v1/checkout-sessions`                       | Optional idempotent provider handoff     |
| `/api/v1/providers/:providerId/contributions/:id` | Scoped private status                    |
| `/schemas/v1.json`                                | Generated domain schemas                 |

Except liveness and optional configured OAuth resource metadata, use an
Authorization Bearer header. Scopes do not constitute payment consent. The
synthetic provider uses `example.invalid` checkout URLs and cannot take payment.

The CLI supports `OPEN_GIVING_MODE=demo` only. It cannot select a real nonprofit,
read provider credentials or call a nonprofit API. Real integration code belongs
in the adopting application; see the
[fictional embedded example](../examples/embedded-provider/README.md).

The [Cloudflare example](../examples/cloudflare-worker/README.md) uses the same
transport with an edge-safe schema validator and synthetic reads only. No hosting
account is required to run its tests. Nothing in this branch deploys on push.
