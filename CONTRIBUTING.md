# Contributing

Use Node.js 22 or newer. Run `npm ci`, create a feature branch, make the change,
then run `npm test`. Include the behavior changed and relevant validation in the
pull request. Add tests for contract, privacy, or payment behavior when relevant.

Keep reusable validation and transport in core packages. Real nonprofit adapters,
API clients and deployment wiring belong in the nonprofit's repository. This
repository accepts fictional examples only. Do not add provider-specific or
currency-assuming compatibility tools to the shared server.

Contributions are licensed under Apache-2.0. Sign off commits with `git commit -s`
to certify the [Developer Certificate of Origin](DCO). Only contribute work you
have the right to license. Read [the code of conduct](CODE_OF_CONDUCT.md).

During private development, collaboration is by repository invitation. Public
contribution and security reporting routes will be enabled before publication.
