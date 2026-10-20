import { mkdir, readFile, writeFile } from "node:fs/promises";
import { jsonSchemas, PROTOCOL_VERSION } from "@open-giving/protocol";

const schemas = jsonSchemas();
const response = (name) => ({
  200: {
    description: "Success",
    content: {
      "application/json": { schema: { $ref: `#/components/schemas/${name}` } },
    },
  },
  default: {
    description: "Typed error",
    content: {
      "application/json": { schema: { $ref: "#/components/schemas/Error" } },
    },
  },
});
const body = (name) => ({
  required: true,
  content: {
    "application/json": { schema: { $ref: `#/components/schemas/${name}` } },
  },
});
const pathParams = (names) =>
  names.map((name) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string", pattern: "^[a-zA-Z0-9_-]+$" },
  }));
const openapi = {
  openapi: "3.1.1",
  info: {
    title: "Open Giving SDK host API",
    version: PROTOCOL_VERSION,
    description:
      "Contract exposed by an adopter's host. The SDK operates no shared service; the host supplies authorization and provider adapters. Payment interfaces are optional, and native agent completion requires separate integration.",
  },
  security: [{ serviceBearer: [] }],
  paths: {
    "/api/v1/setup": {
      get: { operationId: "getStarted", responses: response("SetupGuide") },
    },
    "/api/v1/providers": {
      get: {
        operationId: "listProviders",
        responses: response("ProvidersResult"),
      },
    },
    "/api/v1/opportunities": {
      get: {
        operationId: "searchOpportunities",
        parameters: [
          "providerId",
          "category",
          "countryCode",
          "region",
          "locality",
          "location",
          "currency",
          "maxMinorUnits",
          "limit",
          "cursor",
        ].map((name) => ({
          name,
          in: "query",
          schema: ["limit", "maxMinorUnits"].includes(name)
            ? {
                type: "integer",
                minimum: name === "limit" ? 1 : 0,
                ...(name === "limit" ? { maximum: 50 } : {}),
              }
            : { type: "string" },
        })),
        responses: response("SearchResult"),
      },
    },
    "/api/v1/providers/{providerId}/opportunities/{opportunityId}": {
      get: {
        operationId: "getOpportunity",
        parameters: pathParams(["providerId", "opportunityId"]),
        responses: response("OpportunityResult"),
      },
    },
    "/api/v1/gift-preparations": {
      post: {
        operationId: "prepareGift",
        description:
          "Pure public review-link preparation. No payment, reservation, session creation or authorization.",
        requestBody: body("PrepareGiftInput"),
        responses: response("PreparedGiftResult"),
      },
    },
    "/api/v1/quotes": {
      post: {
        operationId: "quoteContribution",
        requestBody: body("QuoteInput"),
        responses: {
          ...response("QuoteResult"),
          201: response("QuoteResult")["200"],
        },
      },
    },
    "/api/v1/checkout-preparations": {
      post: {
        operationId: "prepareCheckout",
        description:
          "State-changing provider checkout preparation without a quote service. Not assumed idempotent; never retry ambiguous outcomes. Requires fresh donor approval; review final total before payment.",
        requestBody: body("PrepareCheckoutInput"),
        responses: {
          201: response("PreparedCheckoutResult")[200],
          default: response("PreparedCheckoutResult").default,
        },
      },
    },
    "/api/v1/checkout-sessions": {
      post: {
        operationId: "createCheckoutSession",
        requestBody: body("CheckoutInput"),
        responses: {
          ...response("CheckoutResult"),
          201: response("CheckoutResult")["200"],
        },
      },
    },
    "/api/v1/providers/{providerId}/contributions/{contributionId}": {
      get: {
        operationId: "getContributionStatus",
        parameters: pathParams(["providerId", "contributionId"]),
        responses: response("StatusResult"),
      },
    },
  },
  components: {
    securitySchemes: {
      serviceBearer: {
        type: "http",
        scheme: "bearer",
        description:
          "Host-validated discovery or narrowly scoped guest/delegated credential. No SDK donor account is required. Discovery access does not authorize private gift operations.",
      },
    },
    schemas,
  },
};
const files = {
  "packages/protocol/schemas/v1.json": { version: PROTOCOL_VERSION, schemas },
  "packages/protocol/openapi.json": openapi,
};
await mkdir("packages/protocol/schemas", { recursive: true });
for (const [path, value] of Object.entries(files)) {
  const text = JSON.stringify(value, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    const existing = await readFile(path, "utf8");
    if (existing !== text)
      throw new Error(`${path} is out of date; run npm run contracts`);
  } else await writeFile(path, text);
}
console.log(
  process.argv.includes("--check")
    ? "Generated contracts match source schemas"
    : "Generated JSON Schema and OpenAPI contracts",
);
