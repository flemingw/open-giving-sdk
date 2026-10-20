import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReferenceProvider } from "@open-giving/reference-provider";
import { ProviderRegistry } from "@open-giving/registry";
import {
  createApplication,
  GivingService,
  staticTokenAuthenticator,
  SCOPES,
} from "@open-giving/server";

const root = new URL("../", import.meta.url);
const json = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const core = ["protocol", "provider-sdk", "conformance", "registry", "server"];
const allowed = new Set(core.map((name) => "@open-giving/" + name));
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(directory, entry.name))
      : /\.(?:ts|mjs)$/.test(entry.name)
        ? [join(directory, entry.name)]
        : [],
  );
}
test("SDK packages have no application, nonprofit-specific or database dependency", () => {
  const packageRoot = fileURLToPath(new URL("packages/", root));
  const active = readdirSync(packageRoot)
    .filter((name) => existsSync(join(packageRoot, name, "package.json")))
    .sort();
  assert.deepEqual(active, [...core].sort());
  for (const name of core) {
    const manifest = json(`packages/${name}/package.json`);
    const runtime = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    };
    for (const dependency of Object.keys(runtime)) {
      if (dependency.startsWith("@open-giving/"))
        assert.ok(
          allowed.has(dependency),
          `${manifest.name} must not depend on ${dependency}`,
        );
      assert.doesNotMatch(
        dependency,
        /sqlite|postgres|supabase|stripe|auth0|clerk/,
      );
    }
    const directory = fileURLToPath(new URL(`packages/${name}/src/`, root));
    for (const path of sourceFiles(directory)) {
      const source = readFileSync(path, "utf8");
      assert.doesNotMatch(
        source,
        /node:sqlite|(?:from|import\s*\()\s*["'](?:node:)?fs(?:[\/"'])|CREATE TABLE|BrowserAuth|TransactionLedger|ProviderOnboarding|StagingState|PreferencesSchema/,
      );
      assert.doesNotMatch(
        source,
        /(?:from|import\s*\()\s*["'][^"']*(?:experiments|adapters|examples)\//,
      );
    }
  }
});
test("the workspace contains only neutral libraries and fictional examples", () => {
  const manifest = json("package.json"),
    build = json("tsconfig.json");
  assert.deepEqual(manifest.workspaces, ["packages/*", "examples/*"]);
  assert.ok(
    build.references.every(
      (x) =>
        !x.path.includes("experiments") &&
        !/transactions|staging|browser-auth|onboarding|stripe-sandbox|durable-provider/.test(
          x.path,
        ),
    ),
  );
  assert.ok(!("start:browser-workbench" in manifest.scripts));
  assert.match(manifest.scripts.start, /examples\/node-connector/);
  const lock = json("package-lock.json");
  assert.ok(
    Object.keys(lock.packages).every((path) => !path.includes("experiments/")),
  );
  const adapters = fileURLToPath(new URL("adapters/", root));
  assert.ok(!existsSync(adapters) || sourceFiles(adapters).length === 0);
  for (const name of [
    "transactions",
    "browser-auth",
    "onboarding",
    "staging",
    "stripe-sandbox",
    "durable-provider",
  ]) {
    assert.equal(lock.packages[`node_modules/@open-giving/${name}`], undefined);
  }
  // tsc does not delete old outputs when a source file moves. A stale CLI in an
  // existing dist/ must never leak concrete provider dependencies into a package.
  const transport = json("packages/server/package.json");
  assert.deepEqual(transport.files, [
    "dist/index.js",
    "dist/index.d.ts",
    "dist/service.js",
    "dist/service.d.ts",
    "dist/oauth.js",
    "dist/oauth.d.ts",
    "dist/tools.js",
    "dist/tools.d.ts",
    "dist/onboarding.js",
    "dist/onboarding.d.ts",
  ]);
});

test("runtime libraries and fictional examples contain no real-provider clients or endpoints", () => {
  const paths = [
    ...core.flatMap((name) =>
      sourceFiles(fileURLToPath(new URL(`packages/${name}/src/`, root))),
    ),
    ...[
      "embedded-provider/src/",
      "reference-provider/src/",
      "node-connector/src/",
      "cloudflare-worker/",
    ].flatMap((path) =>
      sourceFiles(fileURLToPath(new URL(`examples/${path}`, root))),
    ),
  ];
  for (const path of paths) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(
      source,
      /neighborshare|nbshare|muse|klaviyo|hasura/i,
      path,
    );
    for (const match of source.matchAll(
      /https?:\/\/([a-z0-9.-]+|\[[a-f0-9:]+\])/gi,
    )) {
      const host = match[1];
      assert.ok(
        ["localhost", "127.0.0.1", "[::1]", "json-schema.org"].includes(host) ||
          /(?:^|\.)(?:example|invalid|test)$/.test(host),
        `${path}: unexpected service host`,
      );
    }
  }
  const lock = json("package-lock.json");
  assert.ok(
    Object.keys(lock.packages).every(
      (path) =>
        !path.startsWith("adapters/") &&
        !path.includes("@open-giving/neighborshare"),
    ),
  );
  assert.deepEqual(json("examples/node-connector/package.json").dependencies, {
    "@modelcontextprotocol/node": "2.1.1",
    "@open-giving/server": "*",
    "@open-giving/registry": "*",
    "@open-giving/reference-provider": "*",
  });
});

test("the example CLI rejects a real-provider mode before starting a server", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("examples/node-connector/dist/cli.js", root))],
    {
      env: { OPEN_GIVING_MODE: "external-provider" },
      encoding: "utf8",
      timeout: 5000,
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsupported OPEN_GIVING_MODE/);
  assert.equal(result.stdout, "");
});

test("a host-authorized guest context can quote, prepare and recover its own status without SDK signup, preferences or storage", async (t) => {
  const provider = createReferenceProvider();
  const token = "synthetic-scoped-guest-grant-000000000000001";
  const other = "synthetic-scoped-guest-grant-000000000000002";
  const origin = "https://provider.example";
  const app = createApplication({
    publicOrigin: origin,
    service: new GivingService(
      new ProviderRegistry(
        [
          {
            id: "synthetic-provider",
            adapter: provider,
            verification: "sandbox",
          },
        ],
        true,
      ),
    ),
    authenticate: staticTokenAuthenticator([
      {
        token,
        principal: {
          id: "provider-bound-guest-one",
          clientId: "provider-approved-agent",
          scopes: SCOPES,
        },
      },
      {
        token: other,
        principal: {
          id: "provider-bound-guest-two",
          clientId: "provider-approved-agent",
          scopes: SCOPES,
        },
      },
    ]),
  });
  t.after(() => app.close());
  // These credentials simulate grants issued/bound by the provider, not a shared
  // public API key, guest-auth implementation or an Open Giving account service.
  const request = (path, body, credential = token) =>
    app.fetch(
      new Request(origin + path, {
        method: body ? "POST" : "GET",
        headers: {
          authorization: `Bearer ${credential}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  const discovered = await request("/api/v1/opportunities");
  assert.equal(discovered.status, 200);
  const item = (await discovered.json()).opportunities[0];
  const quoteResponse = await request("/api/v1/quotes", {
    providerId: item.providerId,
    opportunityId: item.id,
    amount: item.amount,
  });
  assert.equal(quoteResponse.status, 201);
  const { quote } = await quoteResponse.json();
  const input = {
    providerId: item.providerId,
    quoteId: quote.id,
    idempotencyKey: "provider-bound-request-0001",
  };
  assert.equal(
    (await request("/api/v1/checkout-sessions", input, other)).status,
    404,
  );
  const prepared = await request("/api/v1/checkout-sessions", input);
  assert.equal(prepared.status, 201);
  const { checkout } = await prepared.json();
  assert.equal(checkout.contribution.status, "pending");
  const replay = await (
    await request("/api/v1/checkout-sessions", input)
  ).json();
  assert.equal(replay.checkout.contribution.id, checkout.contribution.id);
  const path = `/api/v1/providers/${item.providerId}/contributions/${checkout.contribution.id}`;
  assert.equal((await request(path, undefined, other)).status, 404);
  assert.equal((await request(path)).status, 200);
  // No confirmation is fabricated: this test exercises handoff, not payment.
  assert.equal(
    (await (await request(path)).json()).contribution.status,
    "pending",
  );
});
