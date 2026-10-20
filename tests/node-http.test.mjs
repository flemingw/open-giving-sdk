import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { toNodeHandler } from "@modelcontextprotocol/node";
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

test("Node HTTP mount serves authenticated REST and an actual remote MCP connection", async (t) => {
  let app;
  const handler = toNodeHandler(
    { fetch: (request) => app.fetch(request) },
    { maxRequestBodySize: 32768 },
  );
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await app?.close();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const token = "synthetic-tcp-test-token-01234567890123456789";
  app = createApplication({
    publicOrigin: origin,
    service: new GivingService(
      new ProviderRegistry(
        [
          {
            id: "synthetic-provider",
            adapter: createReferenceProvider(),
            verification: "sandbox",
          },
        ],
        true,
      ),
    ),
    authenticate: staticTokenAuthenticator([
      {
        token,
        principal: { id: "tcp-user", clientId: "tcp-client", scopes: SCOPES },
      },
    ]),
  });
  assert.equal((await fetch(origin + "/healthz")).status, 200);
  assert.equal((await fetch(origin + "/api/v1/providers")).status, 401);
  const providers = await fetch(origin + "/api/v1/providers", {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal((await providers.json()).providers[0].id, "synthetic-provider");
  const client = new Client(
    { name: "tcp-test", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  t.after(() => client.close());
  await client.connect(
    new StreamableHTTPClientTransport(new URL(origin + "/mcp"), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );
  const result = await client.callTool({
    name: "get_opportunity",
    arguments: {
      providerId: "synthetic-provider",
      opportunityId: "example-transit",
    },
  });
  assert.equal(result.structuredContent.opportunity.amount.minorUnits, 2500);
});
