import test from "node:test";
import assert from "node:assert/strict";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { ProviderRegistry } from "@open-giving/registry";
import {
  GivingService,
  createApplication,
  staticTokenAuthenticator,
} from "@open-giving/server";
import {
  fixture,
  opportunityId,
  input,
} from "./fixtures/embedded-provider.mjs";

// Independent fictional provider: no EUR, UUID, quote,
// account, database or status API assumptions. Synthetic, not a second adopter.
function secondProvider() {
  const item = {
    providerId: "community-fund",
    id: opportunityId,
    organization: { id: "community", displayName: "Synthetic Community Fund" },
    title: "Food support",
    summary: "Synthetic CAD partial-funding example.",
    category: "food",
    amount: { currency: "CAD", minorUnits: 4000 },
    amountRemaining: { currency: "CAD", minorUnits: 3000 },
    fundingModel: "partial",
    status: "available",
    disclosure: "Demonstration only.",
    location: { countryCode: "CA", locality: "Toronto", region: "ON" },
  };
  return {
    async getProvider() {
      return {
        id: item.providerId,
        displayName: "Community Fund",
        verification: "sandbox",
        capabilities: {
          currencies: ["CAD"],
          fundingModels: ["partial"],
          completionModes: [],
        },
      };
    },
    async searchOpportunities() {
      return [item];
    },
    async getOpportunity(id) {
      return id === item.id ? item : null;
    },
    async prepareGift(input) {
      return {
        providerId: item.providerId,
        opportunityId: item.id,
        amount: input.amount,
        reviewUrl: "https://community.example/existing-give",
        status: "review_required",
        disclosure: "Review with the provider. No money moved.",
      };
    },
  };
}
test("partial opportunities rank by the remaining amount a donor can finish, not the original target", async () => {
  const adapter = secondProvider();
  const original = await adapter.getOpportunity(opportunityId);
  const items = [
    {
      ...original,
      id: "partial-finish",
      amount: { currency: "CAD", minorUnits: 10000 },
      amountRemaining: { currency: "CAD", minorUnits: 2500 },
    },
    {
      ...original,
      id: "exact-small",
      fundingModel: "exact",
      amount: { currency: "CAD", minorUnits: 1000 },
      amountRemaining: { currency: "CAD", minorUnits: 1000 },
    },
  ];
  adapter.searchOpportunities = async () => items;
  adapter.getProvider = async () => ({
    id: "community-fund",
    displayName: "Community Fund",
    verification: "sandbox",
    capabilities: {
      currencies: ["CAD"],
      fundingModels: ["exact", "partial"],
      completionModes: [],
    },
  });
  const service = new GivingService(
    new ProviderRegistry(
      [{ id: "community-fund", adapter, verification: "sandbox" }],
      true,
    ),
  );
  const result = await service.search(
    { maxAmount: { currency: "CAD", minorUnits: 2500 } },
    { id: "reader", clientId: "agent", scopes: ["opportunities:read"] },
  );
  assert.deepEqual(
    result.opportunities.map((item) => item.id),
    ["partial-finish", "exact-small"],
  );
});
test("independent nonprofits and MCP/HTTP agents share the same core without colliding IDs or converting currencies", async (t) => {
  const f = fixture();
  const pantry = f.adapter;
  const service = new GivingService(
    new ProviderRegistry(
      [
        {
          id: "example-pantry",
          adapter: pantry,
          verification: "sandbox",
        },
        {
          id: "community-fund",
          adapter: secondProvider(),
          verification: "sandbox",
        },
      ],
      true,
    ),
  );
  const origin = "https://connector.example";
  const entries = ["mcp-agent", "http-agent"].map((id) => ({
    token: `synthetic-agent-grant-${id}-000000000000000`,
    principal: { id, clientId: id, scopes: ["opportunities:read"] },
  }));
  const app = createApplication({
    service,
    publicOrigin: origin,
    authenticate: staticTokenAuthenticator(entries),
  });
  t.after(() => app.close());
  const client = new Client({ name: "independent-mcp-client", version: "1" });
  t.after(() => client.close());
  await client.connect(
    new StreamableHTTPClientTransport(new URL(origin + "/mcp"), {
      requestInit: { headers: { authorization: `Bearer ${entries[0].token}` } },
      fetch: (url, init) => app.fetch(new Request(url, init)),
    }),
  );
  const mcpProviders = await client.callTool({
    name: "list_providers",
    arguments: {},
  });
  assert.deepEqual(
    mcpProviders.structuredContent.providers.map((p) => p.id),
    ["community-fund", "example-pantry"],
  );
  const mcpFound = await client.callTool({
    name: "search_opportunities",
    arguments: {},
  });
  const httpFound = await (
    await app.fetch(
      new Request(origin + "/api/v1/opportunities", {
        headers: { authorization: `Bearer ${entries[1].token}` },
      }),
    )
  ).json();
  assert.deepEqual(mcpFound.structuredContent, httpFound);
  assert.equal(httpFound.opportunities.length, 2);
  assert.ok(httpFound.opportunities.every((o) => o.id === opportunityId));
  const smaller = await client.callTool({
    name: "search_needs",
    arguments: { maxAmount: { currency: "CAD", minorUnits: 500 } },
  });
  assert.deepEqual(
    smaller.structuredContent.opportunities.map((o) => o.providerId),
    ["community-fund"],
  );
  const eur = await client.callTool({
    name: "get_opportunity",
    arguments: { providerId: "example-pantry", opportunityId },
  });
  assert.deepEqual(eur.structuredContent.opportunity.amount, input.amount);
  const prepared = await client.callTool({
    name: "prepare_gift",
    arguments: {
      providerId: "community-fund",
      opportunityId,
      amount: { currency: "CAD", minorUnits: 500 },
    },
  });
  assert.equal(
    prepared.structuredContent.gift.reviewUrl,
    "https://community.example/existing-give",
  );
  const overRemaining = await client.callTool({
    name: "prepare_gift",
    arguments: {
      providerId: "community-fund",
      opportunityId,
      amount: { currency: "CAD", minorUnits: 3500 },
    },
  });
  assert.equal(overRemaining.isError, true);
  const tools = (await client.listTools()).tools;
  assert.ok(tools.every((tool) => tool.annotations.readOnlyHint));
  assert.ok(!tools.some((tool) => /checkout|quote/.test(tool.name)));
  assert.equal(f.calls.length, 0);
});

test("direct checkout requires write scope, strict arguments and provider opt-in, without inventing a quote service", async () => {
  const f = fixture({ checkout: true });
  const adapter = f.adapter;
  const service = new GivingService(
    new ProviderRegistry(
      [{ id: "example-pantry", adapter, verification: "sandbox" }],
      true,
    ),
  );
  const read = {
    id: "reader",
    clientId: "mcp-agent",
    scopes: ["opportunities:read"],
  };
  const write = {
    id: "writer",
    clientId: "http-agent",
    scopes: ["opportunities:read", "checkout:write"],
  };
  await assert.rejects(service.prepareCheckout(input, read, "test"), {
    code: "forbidden",
  });
  await assert.rejects(
    service.prepareCheckout({ ...input, approved: true }, write, "test"),
    { code: "invalid_request" },
  );
  const result = await service.prepareCheckout(input, write, "test");
  assert.equal(result.checkout.status, "approval_required");
  assert.equal(f.calls[0].context.clientId, "http-agent");
  assert.equal(adapter.quoteContribution, undefined);
  assert.equal(adapter.getContributionStatus, undefined);
  assert.equal(adapter.createCheckoutSession, undefined);
});
