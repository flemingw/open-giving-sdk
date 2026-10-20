import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "@open-giving/registry";
import { createApplication, GivingService } from "@open-giving/server";
import { fixture, input } from "./fixtures/embedded-provider.mjs";

test("HTTP preparation delegates to the embedded nonprofit function; forbidden and unsupported operations never call it", async (t) => {
  const f = fixture({ checkout: true });
  const adapter = f.adapter;
  const origin = "https://connector.example";
  const app = createApplication({
    publicOrigin: origin,
    service: new GivingService(
      new ProviderRegistry(
        [{ id: input.providerId, adapter, verification: "sandbox" }],
        true,
      ),
    ),
    authenticate: async (request) => ({
      id: "host-grant",
      clientId: "independent-http-client",
      scopes: request.headers.has("x-test-readonly")
        ? ["opportunities:read"]
        : ["opportunities:read", "checkout:write"],
    }),
  });
  t.after(() => app.close());
  const call = (body, readOnly = false) =>
    app.fetch(
      new Request(origin + "/api/v1/checkout-preparations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(readOnly ? { "x-test-readonly": "true" } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  assert.equal((await call(input, true)).status, 403);
  assert.equal(
    (await call({ ...input, amount: { currency: "EUR", minorUnits: 500 } }))
      .status,
    400,
  );
  assert.equal((await call({ ...input, donorEmail: "PRIVATE" })).status, 400);
  assert.equal(f.calls.length, 0);
  const response = await call(input);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).checkout.status, "approval_required");
  assert.equal(f.calls.length, 1);
  delete adapter.prepareCheckout;
  assert.equal((await call(input)).status, 422);
  assert.equal(f.calls.length, 1);
});
