import test from "node:test";
import assert from "node:assert/strict";
import { staticTokenAuthenticator } from "@open-giving/server";
const token = "synthetic-credential-for-read-scope-0000000000";
const principal = () => ({
  id: "guest",
  clientId: "agent",
  scopes: ["opportunities:read"],
});
const request = (value) =>
  new Request("https://connector.example/mcp", {
    headers: { authorization: value },
  });

test("static host credentials fail early for ambiguous, whitespace or unbounded configuration", () => {
  for (const entries of [
    [],
    [{ token: "short", principal: principal() }],
    [{ token: token + "\n", principal: principal() }],
    [{ token: "x".repeat(4097), principal: principal() }],
    [
      { token, principal: principal() },
      { token, principal: { ...principal(), scopes: ["checkout:write"] } },
    ],
  ])
    assert.throws(() => staticTokenAuthenticator(entries));
});
test("static grants are snapshots and returned scopes cannot change later authorization", async () => {
  const configured = principal(),
    authenticate = staticTokenAuthenticator([{ token, principal: configured }]);
  configured.scopes.push("checkout:write");
  configured.id = "changed-after-setup";
  const first = await authenticate(request(`bEaReR ${token}`));
  assert.equal(first.id, "guest");
  assert.deepEqual(first.scopes, ["opportunities:read"]);
  first.scopes.push("checkout:write");
  assert.deepEqual((await authenticate(request(`Bearer ${token}`))).scopes, [
    "opportunities:read",
  ]);
  assert.equal(await authenticate(request("Bearer wrong")), null);
  assert.equal(await authenticate(request(`Bearer  ${token}`)), null);
});
test("the maximum configured token length can actually authenticate", async () => {
  const long = "x".repeat(4096);
  const authenticate = staticTokenAuthenticator([
    { token: long, principal: principal() },
  ]);
  assert.equal((await authenticate(request(`Bearer ${long}`))).id, "guest");
  assert.equal(await authenticate(request(`Bearer ${long}x`)), null);
});
