# Local provider routing

An in-process map binds provider IDs to adapters and host-controlled trust states.
Sandbox providers require explicit opt-in. Suspension or an optional `isEnabled`
host policy takes effect on subsequent operations. An adapter cannot promote its
own trust state.

This is a library, not a registry service, charity verifier or nonprofit signup
portal. Each adopter determines its own providers and operational policy.
