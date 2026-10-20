import test from "node:test";
import assert from "node:assert/strict";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createReferenceProvider } from "@open-giving/reference-provider";
import { ProviderRegistry } from "@open-giving/registry";
import {
  GivingService,
  createApplication,
  staticTokenAuthenticator,
  SCOPES,
} from "@open-giving/server";

const token = "synthetic-test-token-one-01234567890123456789";
const secondToken = "synthetic-test-token-two-01234567890123456789";
const readToken = "synthetic-read-token-012345678901234567890123";
const origin = "https://giving.example";
function setup(options = {}) {
  const adapter = options.adapter ?? createReferenceProvider();
  const registry = new ProviderRegistry(
    [{ id: "synthetic-provider", adapter, verification: "sandbox" }],
    true,
  );
  const service = new GivingService(registry);
  const app = createApplication({
    service,
    publicOrigin: origin,
    authenticate: staticTokenAuthenticator([
      {
        token,
        principal: { id: "user-one", clientId: "client-one", scopes: SCOPES },
      },
      {
        token: secondToken,
        principal: { id: "user-two", clientId: "client-two", scopes: SCOPES },
      },
      {
        token: readToken,
        principal: {
          id: "read-user",
          clientId: "read-client",
          scopes: ["opportunities:read"],
        },
      },
    ]),
    ...options.appOptions,
  });
  const request = (
    path,
    { body, credential = token, method, headers = {} } = {},
  ) =>
    app.fetch(
      new Request(origin + path, {
        method: method ?? (body === undefined ? "GET" : "POST"),
        headers: {
          authorization: `Bearer ${credential}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  return { adapter, registry, service, app, request };
}
const quoteInput = {
  providerId: "synthetic-provider",
  opportunityId: "example-transit",
  amount: { currency: "USD", minorUnits: 2500 },
};

test("HTTP requires bearer auth, rejects query credentials and cross-origin requests", async (t) => {
  const { request, app } = setup();
  t.after(() => app.close());
  assert.equal(
    (await request("/api/v1/providers", { credential: "invalid" })).status,
    401,
  );
  assert.equal((await request("/api/v1/providers?token=private")).status, 400);
  assert.equal(
    (
      await request("/api/v1/providers", {
        headers: { origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await app.fetch(new Request("https://evil.example/api/v1/providers")))
      .status,
    403,
  );
  assert.equal((await request("/healthz", { credential: "" })).status, 200);
});

test("HTTP search filters budget, location, and rejects extra donor context", async (t) => {
  const { request, app } = setup();
  t.after(() => app.close());
  const found = await request(
    "/api/v1/opportunities?currency=USD&maxMinorUnits=3000&locality=boston",
  );
  assert.equal(found.status, 200);
  assert.deepEqual(
    (await found.json()).opportunities.map((item) => item.id),
    ["example-transit"],
  );
  assert.equal(
    (await request("/api/v1/opportunities?currency=USD")).status,
    400,
  );
  assert.equal(
    (await request("/api/v1/opportunities?limit=1&limit=2")).status,
    400,
  );
  assert.equal(
    (await request("/api/v1/opportunities?email=private@example.com")).status,
    400,
  );
});

test("pagination produces distinct results and binds cursors to filters", async (t) => {
  const { request, app } = setup();
  t.after(() => app.close());
  const first = await (await request("/api/v1/opportunities?limit=1")).json();
  assert.ok(first.nextCursor);
  const next = await (
    await request(`/api/v1/opportunities?limit=1&cursor=${first.nextCursor}`)
  ).json();
  assert.notEqual(first.opportunities[0].id, next.opportunities[0].id);
  assert.equal(next.nextCursor, undefined);
  assert.equal(
    (
      await request(
        `/api/v1/opportunities?limit=1&category=food&cursor=${first.nextCursor}`,
      )
    ).status,
    400,
  );
  assert.equal(
    (await request("/api/v1/opportunities?cursor=not-a-cursor")).status,
    400,
  );
});

test("read-only credentials cannot create quotes or sessions", async (t) => {
  const { request, app } = setup();
  t.after(() => app.close());
  assert.equal(
    (await request("/api/v1/providers", { credential: readToken })).status,
    200,
  );
  assert.equal(
    (
      await request("/api/v1/quotes", {
        body: quoteInput,
        credential: readToken,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/v1/checkout-sessions", {
        body: {},
        credential: readToken,
      })
    ).status,
    403,
  );
});

test("synthetic HTTP contribution flow is idempotent, scoped, and provider-confirmed", async (t) => {
  const { request, app, adapter } = setup();
  t.after(() => app.close());
  const quoteResponse = await request("/api/v1/quotes", { body: quoteInput });
  assert.equal(quoteResponse.status, 201);
  const { quote } = await quoteResponse.json();
  assert.equal(quote.total.minorUnits, 2500);
  const input = {
    providerId: "synthetic-provider",
    quoteId: quote.id,
    idempotencyKey: "synthetic-idempotency-key",
  };
  const first = await (
    await request("/api/v1/checkout-sessions", { body: input })
  ).json();
  const second = await (
    await request("/api/v1/checkout-sessions", { body: input })
  ).json();
  assert.deepEqual(first, second);
  assert.equal(first.checkout.contribution.status, "pending");
  const id = first.checkout.contribution.id;
  const statusUrl = `/api/v1/providers/synthetic-provider/contributions/${id}`;
  assert.equal(
    (await request(statusUrl, { credential: secondToken })).status,
    404,
  );
  adapter.confirmForTest(id);
  assert.equal(
    (await (await request(statusUrl)).json()).contribution.status,
    "confirmed",
  );
  assert.equal(
    (
      await request(
        "/api/v1/providers/synthetic-provider/opportunities/example-transit",
      )
    ).status,
    409,
  );
});

test("quote ownership and exact-value amounts are enforced", async (t) => {
  const { request, app } = setup();
  t.after(() => app.close());
  assert.equal(
    (
      await request("/api/v1/quotes", {
        body: { ...quoteInput, amount: { currency: "USD", minorUnits: 2000 } },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/v1/quotes", {
        body: { ...quoteInput, amount: { currency: "CAD", minorUnits: 2500 } },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/v1/quotes", {
        body: { ...quoteInput, approved: true },
      })
    ).status,
    400,
  );
  const { quote } = await (
    await request("/api/v1/quotes", { body: quoteInput })
  ).json();
  const result = await request("/api/v1/checkout-sessions", {
    credential: secondToken,
    body: {
      providerId: "synthetic-provider",
      quoteId: quote.id,
      idempotencyKey: "different-user-attempt",
    },
  });
  assert.equal(result.status, 404);
});

test("simultaneous synthetic checkouts acquire only one hold", async (t) => {
  const { request, app } = setup();
  t.after(() => app.close());
  const quotes = await Promise.all(
    [1, 2].map(
      async () =>
        (await (await request("/api/v1/quotes", { body: quoteInput })).json())
          .quote,
    ),
  );
  const results = await Promise.all(
    quotes.map((quote, index) =>
      request("/api/v1/checkout-sessions", {
        body: {
          providerId: "synthetic-provider",
          quoteId: quote.id,
          idempotencyKey: `synthetic-race-key-${index}`,
        },
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
});

test("expired synthetic holds are released and idempotency conflicts fail safely", async () => {
  let now = Date.now();
  const provider = createReferenceProvider({ clock: () => now });
  const context = { principalId: "test", clientId: "test", requestId: "test" };
  const first = await provider.quoteContribution(quoteInput, context);
  const other = await provider.quoteContribution(quoteInput, context);
  const session = await provider.createCheckoutSession(
    { quoteId: first.id, idempotencyKey: "test-replay-key-000" },
    context,
  );
  await assert.rejects(
    provider.createCheckoutSession(
      { quoteId: other.id, idempotencyKey: "test-replay-key-000" },
      context,
    ),
    { code: "idempotency_conflict" },
  );
  assert.equal(
    (await provider.searchOpportunities()).some(
      (item) => item.id === "example-transit",
    ),
    false,
  );
  now += 600001;
  assert.equal(
    (await provider.getContributionStatus(session.contribution.id, context))
      .status,
    "expired",
  );
  assert.equal(
    (await provider.searchOpportunities()).some(
      (item) => item.id === "example-transit",
    ),
    true,
  );
  await assert.rejects(
    provider.createCheckoutSession(
      { quoteId: other.id, idempotencyKey: "new-key-after-expiry" },
      context,
    ),
    { code: "quote_expired" },
  );
});

test("registry trust is operator-controlled and suspension takes effect immediately", async (t) => {
  const { registry, request, app } = setup();
  t.after(() => app.close());
  assert.equal(
    (await (await request("/api/v1/providers")).json()).providers[0]
      .verification,
    "sandbox",
  );
  const disabled = new ProviderRegistry([
    {
      id: "synthetic-provider",
      adapter: createReferenceProvider(),
      verification: "sandbox",
    },
  ]);
  assert.deepEqual(await disabled.list(), []);
  assert.throws(() => disabled.get("synthetic-provider"), {
    code: "provider_not_verified",
  });
  registry.setVerification("synthetic-provider", "suspended");
  assert.deepEqual(
    (await (await request("/api/v1/providers")).json()).providers,
    [],
  );
  assert.equal(
    (
      await request(
        "/api/v1/providers/synthetic-provider/opportunities/example-transit",
      )
    ).status,
    403,
  );
});

test("rate limits and logs exclude credentials, query context, and exception text", async (t) => {
  const logs = [];
  const { request, app } = setup({
    appOptions: { requestsPerMinute: 1, logger: (event) => logs.push(event) },
  });
  t.after(() => app.close());
  assert.equal((await request("/api/v1/providers")).status, 200);
  const limited = await request("/api/v1/providers");
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  assert.equal(JSON.stringify(logs).includes(token), false);
  assert.equal(
    Object.keys(logs[0]).sort().join(","),
    "durationMs,method,requestId,status,surface",
  );
});

test("provider exception messages are never exposed", async (t) => {
  const adapter = {
    ...createReferenceProvider(),
    async searchOpportunities() {
      throw new Error("PRIVATE DATABASE PASSWORD");
    },
  };
  const { request, app } = setup({ adapter });
  t.after(() => app.close());
  const response = await request("/api/v1/opportunities");
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes("PRIVATE"), false);
});

test("partial funding can fit a smaller budget and retains the provider currency", async (t) => {
  const { request, app } = setup();
  t.after(() => app.close());
  const search = await (
    await request("/api/v1/opportunities?currency=CAD&maxMinorUnits=1000")
  ).json();
  assert.equal(search.opportunities[0].id, "example-food");
  const response = await request("/api/v1/quotes", {
    body: {
      providerId: "synthetic-provider",
      opportunityId: "example-food",
      amount: { currency: "CAD", minorUnits: 1000 },
    },
  });
  assert.equal(response.status, 201);
  assert.deepEqual((await response.json()).quote.total, {
    currency: "CAD",
    minorUnits: 1000,
  });
});

test("two providers can reuse local opportunity IDs without collisions", async () => {
  const first = createReferenceProvider();
  const second = {
    async getProvider() {
      return { ...(await first.getProvider()), id: "second-provider" };
    },
    async searchOpportunities(query) {
      return (await first.searchOpportunities(query)).map((item) => ({
        ...item,
        providerId: "second-provider",
      }));
    },
    async getOpportunity(id) {
      const item = await first.getOpportunity(id);
      return item ? { ...item, providerId: "second-provider" } : null;
    },
  };
  const service = new GivingService(
    new ProviderRegistry(
      [
        { id: "synthetic-provider", adapter: first, verification: "sandbox" },
        { id: "second-provider", adapter: second, verification: "sandbox" },
      ],
      true,
    ),
  );
  const principal = { id: "test", clientId: "test", scopes: SCOPES };
  const result = await service.search(
    { maxAmount: { currency: "USD", minorUnits: 2500 } },
    principal,
  );
  assert.deepEqual(
    result.opportunities.map((item) => [item.providerId, item.id]),
    [
      ["second-provider", "example-transit"],
      ["synthetic-provider", "example-transit"],
    ],
  );
});

for (const negotiation of ["legacy", "auto"]) {
  test(`official MCP client discovers and calls tools through ${negotiation} protocol`, async (t) => {
    const { app } = setup();
    t.after(() => app.close());
    const client = new Client(
      { name: "open-giving-test", version: "1.0.0" },
      { versionNegotiation: { mode: negotiation } },
    );
    const transport = new StreamableHTTPClientTransport(
      new URL(origin + "/mcp"),
      {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
        fetch: (url, init) => app.fetch(new Request(url, init)),
      },
    );
    await client.connect(transport);
    t.after(() => client.close());
    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "search_opportunities"));
    assert.ok(
      !tools.tools.some((tool) =>
        ["find_needs", "get_need", "create_gift_link"].includes(tool.name),
      ),
    );
    assert.equal(
      tools.tools.find((tool) => tool.name === "quote_contribution").annotations
        .readOnlyHint,
      false,
    );
    const result = await client.callTool({
      name: "search_opportunities",
      arguments: { maxAmount: { currency: "USD", minorUnits: 5000 } },
    });
    assert.equal(result.isError, undefined);
    assert.equal(
      result.structuredContent.opportunities[0].id,
      "example-transit",
    );
    const quote = await client.callTool({
      name: "quote_contribution",
      arguments: quoteInput,
    });
    const checkout = await client.callTool({
      name: "create_checkout_session",
      arguments: {
        providerId: "synthetic-provider",
        quoteId: quote.structuredContent.quote.id,
        idempotencyKey: "official-client-demo-key",
      },
    });
    assert.equal(
      checkout.structuredContent.checkout.contribution.status,
      "pending",
    );
    const rejected = await client.callTool({
      name: "prepare_checkout",
      arguments: {
        ...quoteInput,
        reason: "PRIVATE SAVINGS CONTEXT",
      },
    });
    assert.equal(rejected.isError, true);
    assert.equal(
      JSON.stringify(rejected).includes("PRIVATE SAVINGS CONTEXT"),
      false,
    );
  });
}

test("MCP tool discovery respects credential scopes", async (t) => {
  const { app } = setup();
  t.after(() => app.close());
  const client = new Client({ name: "read-test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(origin + "/mcp"), {
      requestInit: { headers: { authorization: `Bearer ${readToken}` } },
      fetch: (url, init) => app.fetch(new Request(url, init)),
    }),
  );
  t.after(() => client.close());
  const { tools } = await client.listTools();
  assert.ok(tools.every((tool) => tool.annotations.readOnlyHint));
  assert.equal(
    tools.some((tool) => tool.name === "create_checkout_session"),
    false,
  );
});
