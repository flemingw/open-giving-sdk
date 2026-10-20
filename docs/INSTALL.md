# Install Open Giving

```sh
npm install --save-exact @willwfleming/open-giving-sdk@0.1.0-alpha.5
```

Use Node.js 22+. This is an experimental public alpha; pin the exact version.
The source is at https://github.com/flemingw/open-giving-sdk.

Import `GivingService`, `ProviderRegistry`, `createSetupGuide` and the runtime
schemas from `@willwfleming/open-giving-sdk`. Implement the provider adapter in
your own application's repository, using your public HTTP API or existing
functions. The SDK has no nonprofit endpoints, payment processor or database.

Keep provider category identifiers and location labels intact. An opaque place
can use `location.displayName`; structured geography is optional and must be a
provider fact. Search accepts the exact label as `location`. Providers with
native pagination should implement `searchOpportunitiesPage`; provider cursors
are carried through without loading the entire feed. Native pages preserve their
provider's order; the legacy in-memory adapter retains its ranking.

`createSetupGuide(providers)` supplies reusable setup questions and truthful
capability limits. It stores no preferences and grants no payment authorization.
Hosts can expose it through REST/OpenAPI and their normal MCP mapper. Existing
MCP servers may instead embed `createGivingTools` and `givingToolDefinition`.
An optional complete HTTP/MCP host is exported at the `/server` subpath.

The host decides which operations are public and which require authentication.
Public checkout-session preparation need not require a donor account. Actual
payment approval, private status and refunds remain the provider's responsibility.
`source` on checkout preparation is optional channel attribution, not identity,
consent or permission. A session or link never confirms a paid gift.

Run `npm ci --ignore-scripts`, `npm run check`, `npm run demo` and
`npm run pack:sdk` to reproduce the distribution. Internal workspace packages
are build boundaries; the published package has no workspace dependencies.
