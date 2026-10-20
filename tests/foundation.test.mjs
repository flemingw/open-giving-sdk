import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { ProviderRegistry } from "@open-giving/registry";
import { createReferenceProvider } from "@open-giving/reference-provider";
import { createApplication, GivingService } from "@open-giving/server";

test("foundation snapshot contains no operational apps, state or deployment pipeline", () => {
  for (const path of [
    "experiments",
    "deploy",
    ".private",
    "knowledge",
    "docs/release-gates.json",
  ])
    assert.equal(
      existsSync(new URL("../" + path, import.meta.url)),
      false,
      path,
    );
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(manifest.private, true);
  assert.equal("readiness" in manifest.scripts, false);
  const ci = readFileSync(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  assert.match(ci, /release\/sdk-foundation/);
  assert.doesNotMatch(ci, /vercel|wrangler|stripe|secrets\.|npm publish/);
});

test("host enablement policy is checked again on operations, not decided by the adapter", async () => {
  let enabled = true;
  const adapter = createReferenceProvider();
  const registry = new ProviderRegistry(
    [
      {
        id: "synthetic-provider",
        adapter,
        verification: "sandbox",
        isEnabled: () => enabled,
      },
    ],
    true,
  );
  assert.equal((await registry.list()).length, 1);
  enabled = false;
  assert.deepEqual(await registry.list(), []);
  assert.throws(() => registry.get("synthetic-provider"), {
    code: "provider_not_verified",
  });
});

test("connector origins require HTTPS except explicit HTTP loopback", async (t) => {
  const options = {
    service: new GivingService(new ProviderRegistry([])),
    authenticate: async () => null,
  };
  for (const publicOrigin of [
    "ftp://localhost",
    "ftp://127.0.0.1",
    "http://nonprofit.example",
    "https://nonprofit.example/path",
    "https://name:secret@nonprofit.example",
  ])
    assert.throws(() => createApplication({ ...options, publicOrigin }));
  for (const publicOrigin of [
    "https://nonprofit.example",
    "http://127.0.0.1:3001",
    "http://[::1]:3001",
  ]) {
    const app = createApplication({ ...options, publicOrigin });
    t.after(() => app.close());
    assert.equal(
      (await app.fetch(new Request(publicOrigin + "/healthz"))).status,
      200,
    );
  }
});
