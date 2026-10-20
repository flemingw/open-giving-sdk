# Optional synthetic edge host

`worker.mjs` demonstrates mounting the SDK on a Cloudflare-compatible runtime
with an edge-safe JSON Schema validator. It is not required infrastructure and
cannot select a real provider or payment mode.

Host-supplied configuration:

- `MODE=synthetic-readonly`
- `PUBLIC_ORIGIN`: exact canonical HTTPS origin
- `READ_TOKEN`: optional private read credential; public reads use synthetic data
- `DISABLED=true`: stop switch

The host must bundle the workspace dependencies and enable its required Node
compatibility. No personal account, hostname, deployment credential or production
configuration is supplied. Use the test suite to exercise it without deployment.
Production data, distributed rate limiting and private donor authorization need
a separately reviewed host—not this public synthetic example.
