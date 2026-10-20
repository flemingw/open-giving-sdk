import test from "node:test";
import assert from "node:assert/strict";
import { GivingService } from "@open-giving/server/service";
import { createGivingTools } from "@open-giving/server/tools";
import { ProviderRegistry } from "@open-giving/registry";

const principal = {
  id: "guest",
  clientId: "agent",
  scopes: ["opportunities:read"],
};
const item = (id) => ({
  providerId: id,
  id: "same-local-id",
  organization: { id: "partner", displayName: "Fictional Partner" },
  title: "Help",
  summary: "Approved public story",
  category: "CARE & SUPPORT",
  amount: { currency: "EUR", minorUnits: 1000 },
  fundingModel: "exact",
  status: "available",
  disclosure: "Example",
  location: { displayName: "Région libre" },
});
function adapter(id) {
  return {
    async getProvider() {
      return {
        id,
        displayName: id,
        verification: "sandbox",
        capabilities: {
          currencies: ["EUR"],
          fundingModels: ["exact"],
          completionModes: [],
        },
      };
    },
    async searchOpportunities() {
      throw Error("Should not load the whole feed");
    },
    async getOpportunity() {
      return item(id);
    },
    async searchOpportunitiesPage(_query, page) {
      return {
        opportunities: [item(id)],
        ...(page.cursor ? {} : { nextCursor: "upstream-page-6001" }),
      };
    },
  };
}
function service(adapters) {
  return new GivingService(
    new ProviderRegistry(
      adapters.map((adapter) => ({
        id: adapter.id,
        adapter: adapter.value,
        verification: "sandbox",
      })),
      true,
    ),
  );
}

test("native provider cursors preserve opaque categories and places without loading all results", async () => {
  const backend = adapter("one");
  const app = service([{ id: "one", value: backend }]);
  const query = {
    limit: 1,
    category: "CARE & SUPPORT",
    location: "Région libre",
  };
  const first = await app.search(query, principal);
  assert.equal(first.opportunities[0].location.countryCode, undefined);
  assert.equal(first.opportunities[0].category, query.category);
  const next = await app.search(
    { ...query, cursor: first.nextCursor },
    principal,
  );
  assert.equal(next.nextCursor, undefined);
  await assert.rejects(
    app.search(
      { ...query, category: "education", cursor: first.nextCursor },
      principal,
    ),
    { code: "invalid_request" },
  );
});

test("multiple nonprofits keep independent native cursors even when local IDs overlap", async () => {
  const app = service(["one", "two"].map((id) => ({ id, value: adapter(id) })));
  let cursor;
  const ids = [];
  do {
    const result = await app.search(
      { limit: 1, ...(cursor ? { cursor } : {}) },
      principal,
    );
    ids.push(...result.opportunities.map((row) => row.providerId));
    cursor = result.nextCursor;
  } while (cursor);
  assert.deepEqual(ids, ["one", "one", "two", "two"]);
});

test("generic setup runs as SDK behavior and rejects donor answers", async () => {
  const tools = createGivingTools(
    service([{ id: "one", value: adapter("one") }]),
    principal,
    "test",
  );
  const setup = tools.find((tool) => tool.name === "get_started");
  const result = await setup.call({});
  assert.equal(result.structuredContent.preferencesSaved, false);
  assert.equal(result.structuredContent.paymentAuthorized, false);
  assert.deepEqual(
    result.structuredContent.providers[0].capabilities.currencies,
    ["EUR"],
  );
  assert.equal(
    (await setup.call({ email: "private@example.invalid" })).isError,
    true,
  );
});
