import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import {
  createJwtAuthenticator,
  createApplication,
  GivingService,
} from "@open-giving/server";
import { ProviderRegistry } from "@open-giving/registry";
const issuer = "https://identity.example";
const resource = "https://giving.example";
test("OAuth resource verifier binds signature, issuer, resource, access-token type, expiry, client, scopes, and revocation", async () => {
  const pair = await generateKeyPair("ES256");
  const jwk = await exportJWK(pair.publicKey);
  jwk.kid = "example-key";
  let revoked = false;
  const authenticate = createJwtAuthenticator({
    issuer,
    audience: resource,
    jwksUrl: issuer + "/jwks",
    keySet: createLocalJWKSet({ keys: [jwk] }),
    isRevoked: async () => revoked,
  });
  const now = Math.floor(Date.now() / 1000);
  const sign = async (claims = {}, header = {}) =>
    new SignJWT({
      iss: issuer,
      aud: resource,
      sub: "private-donor@example.invalid",
      iat: now,
      exp: now + 600,
      client_id: "agent-one",
      scope: "opportunities:read quotes:write unknown:scope",
      ...claims,
    })
      .setProtectedHeader({
        alg: "ES256",
        typ: "at+jwt",
        kid: "example-key",
        ...header,
      })
      .sign(pair.privateKey);
  const request = (token) =>
    new Request(resource + "/mcp", {
      headers: { authorization: `Bearer ${token}` },
    });
  const valid = await sign();
  const principal = await authenticate(request(valid));
  assert.match(principal.id, /^p-[a-f0-9]{64}$/);
  assert.ok(!principal.id.includes("private-donor"));
  assert.deepEqual(principal.scopes, ["opportunities:read", "quotes:write"]);
  for (const claims of [
    { iss: "https://evil.example" },
    { aud: "https://other.example" },
    { exp: now - 60 },
    { nbf: now + 600 },
    { iat: now - 7200 },
    { sub: "" },
    { client_id: "" },
    { client_id: "one", azp: "two" },
    { scope: "unrelated:scope" },
  ])
    assert.equal(await authenticate(request(await sign(claims))), null);
  assert.equal(
    await authenticate(request(await sign({}, { typ: "JWT" }))),
    null,
  );
  assert.equal(
    await authenticate(request(valid.slice(0, -8) + "tampered")),
    null,
  );
  revoked = true;
  assert.equal(await authenticate(request(valid)), null);
});
test("OAuth metadata is public but operations require a resource-scoped credential", async (t) => {
  const app = createApplication({
    service: new GivingService(new ProviderRegistry([])),
    publicOrigin: resource,
    authenticate: async () => null,
    oauth: { authorizationServers: [issuer] },
  });
  t.after(() => app.close());
  const response = await app.fetch(
    new Request(resource + "/.well-known/oauth-protected-resource"),
  );
  assert.equal(response.status, 200);
  const metadata = await response.json();
  assert.equal(metadata.resource, resource);
  assert.deepEqual(metadata.authorization_servers, [issuer]);
  const denied = await app.fetch(new Request(resource + "/api/v1/providers"));
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get("www-authenticate"), /resource_metadata=/);
  assert.throws(() =>
    createJwtAuthenticator({
      issuer: "http://untrusted.example",
      audience: resource,
      jwksUrl: issuer + "/jwks",
    }),
  );
});
