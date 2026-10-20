import { createServer } from "node:http";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createReferenceProvider } from "@open-giving/reference-provider";
import { ProviderRegistry } from "@open-giving/registry";
import {
  GivingService,
  createApplication,
  staticTokenAuthenticator,
  SCOPES,
} from "@open-giving/server";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} before starting the server`);
  return value;
}
async function main() {
  const mode = process.env.OPEN_GIVING_MODE ?? "demo";
  if (mode !== "demo") throw new Error("Unsupported OPEN_GIVING_MODE");
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");
  const token = required("OPEN_GIVING_SERVICE_TOKEN");
  const publicOrigin =
    process.env.OPEN_GIVING_PUBLIC_ORIGIN ?? `http://127.0.0.1:${port}`;
  const adapter = createReferenceProvider();
  const providerId = "synthetic-provider";
  const registry = new ProviderRegistry(
    [{ id: providerId, adapter, verification: "sandbox" }],
    true,
  );
  const app = createApplication({
    service: new GivingService(registry),
    publicOrigin,
    authenticate: staticTokenAuthenticator([
      {
        token,
        principal: {
          id: "local-developer",
          clientId: "local-development",
          scopes: SCOPES,
        },
      },
    ]),
    logger: (event) => console.log(JSON.stringify(event)),
  });
  const nodeHandler = toNodeHandler(app, {
    maxRequestBodySize: 32768,
    onerror: () => console.error("Request failed before application dispatch"),
  });
  // The SDK's structural Node types omit explicit undefined in optional members;
  // IncomingMessage is its supported runtime input (SDK issue under exactOptionalPropertyTypes).
  const server = createServer((request, response) => {
    void nodeHandler(request as Parameters<typeof nodeHandler>[0], response);
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.listen(port, "127.0.0.1", () =>
    console.log(
      JSON.stringify({
        service: "open-giving",
        mode,
        origin: publicOrigin,
        bind: "127.0.0.1",
        port,
      }),
    ),
  );
  const shutdown = () => {
    server.close();
    void app.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Startup failed");
  process.exitCode = 1;
});
