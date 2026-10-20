import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseProvider } from "@open-giving/conformance";
import { createReferenceProvider } from "@open-giving/reference-provider";
import { fixture } from "./fixtures/embedded-provider.mjs";

test("provider setup diagnostics are read-only and distinguish metadata from working wiring", async () => {
  const adapter = createReferenceProvider();
  adapter.quoteContribution = () => {
    throw new Error("MUST NOT CALL");
  };
  adapter.createCheckoutSession = () => {
    throw new Error("MUST NOT CALL");
  };
  const result = await diagnoseProvider(adapter);
  assert.equal(result.operations.browserHandoff, true);
  assert.equal(result.operations.status, true);
  assert.ok(result.issues.some((text) => text.includes("not a host-approved")));
  delete adapter.createCheckoutSession;
  const incomplete = await diagnoseProvider(adapter);
  assert.equal(incomplete.operations.browserHandoff, false);
  assert.ok(incomplete.issues.some((text) => text.includes("without both")));
});
test("diagnostics fail safely without leaking provider exception text", async () => {
  const result = await diagnoseProvider({
    getProvider: async () => {
      throw new Error("PRIVATE KEY");
    },
  });
  assert.equal(result.operations.discovery, false);
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
  assert.equal(
    (
      await diagnoseProvider({
        getProvider: async () => ({ privateEmail: "PRIVATE" }),
      })
    ).operations.discovery,
    false,
  );
});
test("direct existing checkout diagnostics do not require a quote or fabricated status API", async () => {
  const { adapter, calls } = fixture({ checkout: true });
  const result = await diagnoseProvider(adapter);
  assert.equal(result.operations.checkoutPreparation, true);
  assert.equal(result.operations.quote, false);
  assert.equal(result.operations.status, false);
  assert.ok(
    result.issues.some((text) => text.includes("not assumed idempotent")),
  );
  assert.equal(calls.length, 0);
});
