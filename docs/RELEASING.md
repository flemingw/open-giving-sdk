# Release and compatibility policy

This public alpha is published from an audited source snapshot; earlier private
development history remains in its original private repository. Neither CI nor
`pack:sdk` publishes anything. The independently installable artifact is
`@willwfleming/open-giving-sdk`; workspace packages are implementation/build boundaries, not
separate packages consumers must find on npm.

## Compatibility

- The current alpha is experimental. Pin the exact artifact/version; do not
  assume compatibility between alpha releases. Document breaking changes and
  update contract fixtures, generated assets and consumer tests together.
- Before a 1.0 release, freeze and review the required read interface and public
  tool/schema surface. After 1.0, incompatible public API/schema changes require
  a major version; compatible additions a minor, compatible fixes a patch.
- Optional capabilities are negotiated, not promised for every provider.
  Explicit currency, provider-scoped IDs, host authorization and truthful payment
  status are invariants. No platform's eligibility or payment integration is
  implied by MCP compatibility.
- Test Node 22+, independent installation and TypeScript consumption, official
  MCP/HTTP clients, and fictional providers with different currencies and funding
  models. Existing MCP servers can embed the transport-independent tool catalog.

## Before an approved public release

1. Review source ownership and dependency licenses. Keep real adopter code,
   private writeups, operational evidence and credentials out of the public tree.
2. Review **all** Git refs/history, pull requests, issues, workflow logs and
   artifacts before making an existing repository public. A clean current tree
   is not a clean history. If the private history contains unrelated prototypes,
   prefer a new public repository from a reviewed source snapshot, preserving
   the old repository privately. Do not rewrite or delete it automatically.
3. Choose the public repository owner/name, maintainers and a monitored private
   security-reporting route; update SECURITY.md and package repository metadata.
   Keep Apache-2.0, DCO, contribution and governance documents with the source.
4. Run `npm ci --ignore-scripts`, `npm run check`, `npm run demo` and
   `npm run pack:sdk`. Inspect the archive and dependency/security results;
   preserve the source revision and artifact digest. Tests are not an
   independent security audit or real-provider acceptance.
5. Obtain owner approval before creating a public repository or changing its
   visibility. Publishing source under its license makes the SDK open source;
   npm publication and hosting an example are separate, optional actions.
6. For npm, first confirm control/availability of `@open-giving/sdk` (or choose
   an owned scope), change the explicit private publication gate only in the
   approved release, and review the dry-run artifact. Do not publish an alpha
   under someone else's scope or auto-publish from a push workflow.

Production adapters remain in the adopters' repositories and need their own
deployment, payments, privacy and agent-platform acceptance. The SDK needs no
Cloudflare account, donor identity provider, central database or legal giving
entity to be useful open-source software.
