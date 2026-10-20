# Embeddable provider connector transport

Exposes the common protocol through MCP and HTTP using the official SDK. Run
`npm start` from the root for the optional `examples/node-connector` CLI. The
reusable package imports no concrete provider, database or account application.
`createApplication` supplies a fetch handler for the nonprofit's existing host.

The verifier interface supplies trusted principals and scopes. Static service
credentials support local tests/backend reads; production guest/delegated
authorization is provided by the host, not an Open Giving account service.
Optional JWT helpers verify tokens without creating accounts or sessions.
Payment tools operate only where an adapter implements them. The synthetic
example moves no money and can select only the fictional reference provider.
Its opt-in sandbox session preparation is a separate write, not a quote or payment.
See
[integration](../../docs/PROVIDER_INTEGRATION.md).
