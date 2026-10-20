import test from "node:test";
import assert from "node:assert/strict";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createPantryAdapter } from "@open-giving/example-embedded-provider";
import { ProviderRegistry } from "@open-giving/registry";
import { createApplication, GivingService } from "@open-giving/server";
import {
  fixture,
  input,
  opportunityId,
} from "./fixtures/embedded-provider.mjs";

const principal = {
  id: "provider-authorized-guest",
  clientId: "agent-one",
  scopes: ["opportunities:read", "checkout:write"],
};
const serviceFor = (adapter) =>
  new GivingService(
    new ProviderRegistry(
      [{ id: "example-pantry", adapter, verification: "sandbox" }],
      true,
    ),
  );
function forbidFetch(t) {
  t.mock.method(globalThis, "fetch", () => {
    throw Error("No outbound request is permitted");
  });
}

test("fictional nonprofit reads call its own functions and project only approved public fields", async (t) => {
  forbidFetch(t);
  const { adapter, target } = fixture();
  const service = serviceFor(adapter);
  const found = await service.search(
    { locality: "Dublin", maxAmount: input.amount },
    principal,
  );
  assert.equal(found.opportunities.length, 1);
  assert.deepEqual(found.opportunities[0].amount, input.amount);
  assert.equal(JSON.stringify(found).includes("PRIVATE"), false);
  assert.equal(adapter.prepareCheckout, undefined);
  assert.equal(adapter.quoteContribution, undefined);
  assert.equal(adapter.getContributionStatus, undefined);
  assert.equal(
    (await adapter.getProvider()).capabilities.checkoutPreparation,
    undefined,
  );
  assert.equal(await adapter.getOpportunity("missing"), null);
  const item = await adapter.getOpportunity(opportunityId);
  item.amount.minorUnits = 1;
  assert.equal(
    (await adapter.getOpportunity(opportunityId)).amount.minorUnits,
    2500,
  );
  target.approvedForAgents = false;
  assert.deepEqual(await adapter.searchOpportunities(), []);
  assert.equal(await adapter.getOpportunity(opportunityId), null);
  target.approvedForAgents = true;
  target.available = false;
  assert.deepEqual(await adapter.searchOpportunities(), []);
  await assert.rejects(service.prepareCheckout(input, principal, "request"), {
    code: "unsupported_capability",
  });
});

test("session preparation calls the embedded backend once with trusted context and no donor signup", async (t) => {
  forbidFetch(t);
  const { adapter, calls } = fixture({ checkout: true });
  const result = await serviceFor(adapter).prepareCheckout(
    input,
    principal,
    "request-one",
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    targetKey: opportunityId,
    expectedAmount: input.amount,
    context: {
      principalId: principal.id,
      clientId: principal.clientId,
      requestId: "request-one",
    },
  });
  assert.equal(result.checkout.status, "approval_required");
  assert.equal(
    result.checkout.checkoutUrl,
    "https://checkout.example.invalid/review",
  );
  assert.equal(result.checkout.contribution, undefined);
});

test("stale, unavailable, private and wrong-currency inputs never reach the embedded checkout function", async (t) => {
  forbidFetch(t);
  const { adapter, calls, target } = fixture({ checkout: true });
  const service = serviceFor(adapter);
  for (const invalid of [
    { ...input, amount: { currency: "CAD", minorUnits: 2500 } },
    { ...input, amount: { currency: "EUR", minorUnits: 500 } },
    { ...input, donorEmail: "PRIVATE@example.invalid" },
    { ...input, approved: true },
  ])
    await assert.rejects(
      service.prepareCheckout(invalid, principal, "request"),
      { code: "invalid_request" },
    );
  target.costMinorUnits = 2600;
  await assert.rejects(service.prepareCheckout(input, principal, "request"), {
    code: "invalid_request",
  });
  target.available = false;
  await assert.rejects(service.prepareCheckout(input, principal, "request"), {
    code: "not_found",
  });
  assert.equal(calls.length, 0);
});

test("an uncertain backend session outcome is sanitized and never retried or reported as paid", async (t) => {
  forbidFetch(t);
  const { services } = fixture();
  let writes = 0;
  const adapter = createPantryAdapter({
    ...services,
    async createSession() {
      writes++;
      throw Error("PRIVATE ambiguous backend outcome");
    },
  });
  const origin = "https://application.example";
  const app = createApplication({
    publicOrigin: origin,
    service: serviceFor(adapter),
    authenticate: async () => principal,
  });
  t.after(() => app.close());
  const response = await app.fetch(
    new Request(origin + "/api/v1/checkout-preparations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.equal(body.includes("PRIVATE"), false);
  assert.equal(body.includes('"approval_required"'), false);
  assert.equal(writes, 1);
});

test("official MCP client prepares an embedded session as a write without a network provider client", async (t) => {
  forbidFetch(t);
  const { adapter, calls } = fixture({ checkout: true });
  const origin = "https://application.example";
  const app = createApplication({
    publicOrigin: origin,
    service: serviceFor(adapter),
    authenticate: async () => principal,
  });
  const client = new Client({ name: "fictional-agent", version: "1" });
  t.after(async () => {
    await client.close();
    await app.close();
  });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(origin + "/mcp"), {
      fetch: (url, init) => app.fetch(new Request(url, init)),
    }),
  );
  const tools = (await client.listTools()).tools;
  const checkout = tools.find((tool) => tool.name === "prepare_checkout");
  assert.ok(checkout);
  assert.equal(checkout.annotations.readOnlyHint, false);
  assert.equal(checkout.annotations.idempotentHint, false);
  const result = await client.callTool({
    name: "prepare_checkout",
    arguments: input,
  });
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.checkout.status, "approval_required");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].context.principalId, principal.id);
});
