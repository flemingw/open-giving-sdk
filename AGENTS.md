# Engineering guidance

Read README.md, docs/ARCHITECTURE.md and docs/ROADMAP.md before editing.

- This is an SDK, not a giving operator or hosted platform. No donor accounts,
  central database, payment ledger or nonprofit onboarding service.
- This repository contains neutral libraries and fictional examples only. Real
  nonprofit adapters, API clients, endpoints, credentials and deployment wiring
  belong in the adopting nonprofit's repository, not here. Core packages must
  not import examples or any concrete provider, processor or database.
- Start with discovery and pure review-link preparation. Optional transaction
  interfaces do not impose a quote service or new ledger on an adopter.
- Only approved public opportunity content crosses the boundary. Schema
  projection cannot establish that a free-text string is safe to publish.
- Use integer minor units and explicit currencies. No implicit FX conversion.
- Every gift requires human approval and provider-confirmed status. Never treat
  a link, redirect or handoff as payment. Do not retry ambiguous payments blindly.
- The host supplies authorization; no identity from model arguments. A discovery
  credential must not authorize every donor's private status or payments.
- Use synthetic fixtures and offline tests. Do not commit credentials, donor
  records, source writeups, local state, generated dist/ or node_modules/.
- Keep npm packages and the repository private until explicit publication approval.
- Use feature branches; preserve existing history and unrelated local changes.
- Changes to external nonprofit repositories, shared migrations, deployments and
  real payments require their respective owner approvals.
- Run npm run check and npm run demo. Update runtime schemas and regenerate
  contracts together; document actual compatibility evidence, not aspirations.
