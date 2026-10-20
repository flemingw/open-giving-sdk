import test from "node:test";
import assert from "node:assert/strict";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createDevelopmentWorker } from "../examples/cloudflare-worker/worker.mjs";

const origin = "https://development.example";
const env = {
  MODE: "synthetic-readonly",
  PUBLIC_ORIGIN: origin,
  READ_TOKEN: "synthetic-read-only-credential-01234567890123",
};
const request = (path, init) => new Request(origin + path, init);
test("development Worker is synthetic, read-only, host-bound, and fail-closed", async (t) => {
  assert.throws(() => createDevelopmentWorker({ ...env, MODE: "live" }));
  const worker = createDevelopmentWorker(env);
  t.after(() => worker.close());
  const providers = await (
    await worker.fetch(request("/api/v1/providers"))
  ).json();
  assert.equal(providers.providers[0].verification, "sandbox");
  assert.equal(providers.providers[0].id, "synthetic-provider");
  assert.equal(
    (await worker.fetch(new Request("https://evil.example/api/v1/providers")))
      .status,
    403,
  );
  assert.equal(
    (await worker.fetch(request("/api/v1/providers?token=bad"))).status,
    400,
  );
  assert.equal(
    (await worker.fetch(request("/private/mcp", { method: "POST" }))).status,
    401,
  );
  const write = await worker.fetch(
    request("/api/v1/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  );
  assert.equal(write.status, 403);
  const off = createDevelopmentWorker({ ...env, DISABLED: "true" });
  t.after(() => off.close());
  assert.equal((await off.fetch(request("/healthz"))).status, 503);
});
test("official MCP client discovers only reads using edge-safe validation", async (t) => {
  const worker = createDevelopmentWorker(env);
  const client = new Client({ name: "development-probe", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(origin + "/mcp"),
    {
      fetch: (url, init) => worker.fetch(new Request(url, init)),
    },
  );
  t.after(async () => {
    await client.close();
    await worker.close();
  });
  await client.connect(transport);
  const tools = (await client.listTools()).tools;
  assert.ok(tools.some((tool) => tool.name === "search_opportunities"));
  assert.ok(tools.every((tool) => tool.annotations.readOnlyHint));
  assert.ok(!tools.some((tool) => /checkout|quote|gift_link/.test(tool.name)));
  const result = await client.callTool({
    name: "search_opportunities",
    arguments: { limit: 1 },
  });
  assert.equal(result.structuredContent.opportunities.length, 1);
  assert.match(result.structuredContent.opportunities[0].summary, /Synthetic/);
});
test("private credential rotation revokes the old token without enabling writes", async (t) => {
  const old = createDevelopmentWorker(env);
  const rotated = createDevelopmentWorker({
    ...env,
    READ_TOKEN: "synthetic-rotated-credential-0123456789012345",
  });
  t.after(async () => {
    await old.close();
    await rotated.close();
  });
  const init = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${env.READ_TOKEN}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  };
  assert.equal((await old.fetch(request("/private/mcp", init))).status, 200);
  assert.equal(
    (await rotated.fetch(request("/private/mcp", init))).status,
    401,
  );
});
