import test from "node:test";
import assert from "node:assert/strict";
import { createReferenceProvider } from "@open-giving/reference-provider";
import { ProviderRegistry } from "@open-giving/registry";
import { GivingService } from "@open-giving/server";

test("pure review links remain independent of direct state-changing checkout preparation", async () => {
  const adapter = createReferenceProvider();
  let writes = 0;
  adapter.prepareGift = async (input) => ({
    providerId: input.providerId,
    opportunityId: input.opportunityId,
    amount: input.amount,
    reviewUrl: "https://nonprofit.example/existing-review",
    status: "review_required",
    disclosure:
      "Review and approve with the provider; no payment has been made.",
  });
  adapter.prepareCheckout = async () => {
    writes++;
    throw Error("not allowed");
  };
  const service = new GivingService(
    new ProviderRegistry(
      [{ id: "synthetic-provider", adapter, verification: "sandbox" }],
      true,
    ),
  );
  const principal = {
    id: "guest",
    clientId: "agent",
    scopes: ["opportunities:read"],
  };
  const input = {
    providerId: "synthetic-provider",
    opportunityId: "example-transit",
    amount: { currency: "USD", minorUnits: 2500 },
  };
  assert.equal(
    (await service.prepareGift(input, principal)).gift.status,
    "review_required",
  );
  await assert.rejects(service.prepareCheckout(input, principal, "test"), {
    code: "forbidden",
  });
  await assert.rejects(
    service.prepareGift({ ...input, approved: true }, principal),
    { code: "invalid_request" },
  );
  await assert.rejects(
    service.prepareGift(
      { ...input, amount: { currency: "USD", minorUnits: 500 } },
      principal,
    ),
    { code: "invalid_request" },
  );
  adapter.prepareGift = async () => ({
    ...input,
    reviewUrl: "https://user:secret@evil.example/",
    status: "review_required",
    disclosure: "test",
  });
  await assert.rejects(service.prepareGift(input, principal), {
    code: "provider_unavailable",
  });
  assert.equal(writes, 0);
});
