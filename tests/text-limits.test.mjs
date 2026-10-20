import test from "node:test";
import assert from "node:assert/strict";
import {
  PublicOpportunitySchema,
  ProviderInfoSchema,
} from "@open-giving/protocol";

const opportunity = (length) => ({
  providerId: "fictional",
  id: "need",
  organization: { id: "partner", displayName: "N".repeat(length) },
  title: "T".repeat(length),
  summary: "Approved public story",
  category: "CARE",
  amount: { currency: "USD", minorUnits: 1000 },
  fundingModel: "exact",
  status: "available",
  disclosure: "Fictional example",
});

test("provider display names use the same 256-character limit as nonprofit names", () => {
  const provider = {
    id: "fictional",
    displayName: "P".repeat(256),
    verification: "sandbox",
    capabilities: {
      currencies: ["USD"],
      fundingModels: ["exact"],
      completionModes: [],
    },
  };
  assert.deepEqual(ProviderInfoSchema.parse(provider), provider);
  assert.equal(
    ProviderInfoSchema.safeParse({ ...provider, displayName: "P".repeat(257) })
      .success,
    false,
  );
});

test("public titles and nonprofit names preserve all 256 supported characters", () => {
  for (const length of [160, 161, 200, 201, 256]) {
    assert.deepEqual(
      PublicOpportunitySchema.parse(opportunity(length)),
      opportunity(length),
    );
  }
});

test("public titles and nonprofit names still reject values above the documented limit", () => {
  const result = PublicOpportunitySchema.safeParse(opportunity(257));
  assert.equal(result.success, false);
  assert.deepEqual(
    result.error.issues.map((issue) => issue.path.join(".")),
    ["organization.displayName", "title"],
  );
});
