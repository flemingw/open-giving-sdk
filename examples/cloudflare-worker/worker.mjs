import { createHash } from "node:crypto";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker";
import { createReferenceProvider } from "@open-giving/reference-provider";
import { ProviderRegistry } from "@open-giving/registry";
import {
  createApplication,
  GivingService,
  staticTokenAuthenticator,
} from "@open-giving/server";

// This entry point deliberately cannot select a real provider or payment mode.
// A separate production deployment and security review are required for those.
export function createDevelopmentWorker(env) {
  if (env.MODE !== "synthetic-readonly" || !env.PUBLIC_ORIGIN)
    throw new Error("Development mode and canonical origin are required");
  const origin = new URL(env.PUBLIC_ORIGIN);
  if (origin.origin !== env.PUBLIC_ORIGIN || origin.protocol !== "https:")
    throw new Error("Set a canonical HTTPS origin");
  const principal = {
    id: "development-reader",
    clientId: "development",
    scopes: ["opportunities:read"],
  };
  const authenticateToken = env.READ_TOKEN
    ? staticTokenAuthenticator([{ token: env.READ_TOKEN, principal }])
    : async () => null;
  const fixtures = createReferenceProvider();
  const readonlyProvider = {
    getProvider: async () => {
      const info = await fixtures.getProvider();
      return {
        ...info,
        capabilities: { ...info.capabilities, completionModes: [] },
      };
    },
    searchOpportunities: (...args) => fixtures.searchOpportunities(...args),
    getOpportunity: (...args) => fixtures.getOpportunity(...args),
  };
  const app = createApplication({
    service: new GivingService(
      new ProviderRegistry(
        [
          {
            id: "synthetic-provider",
            adapter: readonlyProvider,
            verification: "sandbox",
          },
        ],
        true,
      ),
    ),
    publicOrigin: env.PUBLIC_ORIGIN,
    jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
    requestsPerMinute: 60,
    authenticate: async (request) => {
      if (request.headers.has("authorization"))
        return authenticateToken(request);
      if (new URL(request.url).pathname.startsWith("/private/")) return null;
      // Trusted at the Cloudflare edge. This is only a per-isolate abuse limit,
      // never a donor identity or a production distributed rate limiter.
      const bucket = createHash("sha256")
        .update(request.headers.get("cf-connecting-ip") ?? "local")
        .digest("hex");
      return { ...principal, id: `public-demo-${bucket}` };
    },
  });
  return {
    close: () => app.close(),
    async fetch(request) {
      const url = new URL(request.url);
      if (env.DISABLED === "true")
        return Response.json(
          { error: "Development endpoint disabled" },
          { status: 503 },
        );
      if (url.origin !== env.PUBLIC_ORIGIN)
        return Response.json({ error: "Host not allowed" }, { status: 403 });
      if (
        (url.pathname === "/" || url.pathname === "/start") &&
        request.method === "GET"
      ) {
        return new Response(
          `Open Giving — DEVELOPMENT ONLY\n\nSynthetic data. No real people, bank/email access, checkout, or money movement.\nNot affiliated with or approved by Meta.\n\nMCP: ${env.PUBLIC_ORIGIN}/mcp\nHTTP: ${env.PUBLIC_ORIGIN}/api/v1/providers\n\nTry: Connect to ${env.PUBLIC_ORIGIN}/mcp. List providers and show one synthetic opportunity. Do not connect accounts or make payments.\n\nPublic reads require no login and contain synthetic data only. /private/mcp requires a configured bearer token. All writes are unavailable.\n`,
          {
            headers: {
              "content-type": "text/plain; charset=utf-8",
              "cache-control": "no-store",
              "x-content-type-options": "nosniff",
              "referrer-policy": "no-referrer",
              "content-security-policy":
                "default-src 'none'; frame-ancestors 'none'",
            },
          },
        );
      }
      if (url.pathname === "/private/mcp") {
        // Authenticate the original path before rewriting for the common handler.
        if (!(await authenticateToken(request)))
          return Response.json(
            { error: "A valid bearer credential is required" },
            {
              status: 401,
              headers: {
                "www-authenticate": 'Bearer realm="open-giving-development"',
                "cache-control": "no-store",
              },
            },
          );
        url.pathname = "/mcp";
        request = new Request(url, request);
      }
      return app.fetch(request);
    },
  };
}

let configured;
let worker;
export default {
  async fetch(request, env) {
    // Bind only to operator-supplied configuration, never the incoming Host.
    const key = JSON.stringify([
      env.MODE,
      env.PUBLIC_ORIGIN,
      env.READ_TOKEN,
      env.DISABLED,
    ]);
    try {
      if (key !== configured) {
        if (worker) await worker.close();
        worker = createDevelopmentWorker(env);
        configured = key;
      }
      return worker.fetch(request);
    } catch {
      return Response.json(
        { error: "Development endpoint is not configured" },
        { status: 503 },
      );
    }
  },
};
