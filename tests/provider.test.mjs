import test from "node:test";
import assert from "node:assert/strict";
import { validateMoney, projectPublicOpportunity } from "@open-giving/protocol";
import { createReferenceProvider } from "@open-giving/reference-provider";
import { checkReadonlyProvider } from "@open-giving/conformance";

test("money rejects fractional, negative, unsafe, and malformed values", () => {
  for (const minorUnits of [
    -1,
    0.5,
    Number.MAX_SAFE_INTEGER + 1,
    NaN,
    Infinity,
  ]) {
    assert.throws(() => validateMoney({ currency: "USD", minorUnits }));
  }
  assert.throws(() => validateMoney({ currency: "usd", minorUnits: 10 }));
  assert.doesNotThrow(() =>
    validateMoney({ currency: "JPY", minorUnits: 100 }),
  );
});

test("synthetic provider passes initial shared read checks", async () => {
  assert.deepEqual(await checkReadonlyProvider(createReferenceProvider()), []);
});

test("max budget compares matching currencies only", async () => {
  const provider = createReferenceProvider();
  const query = { maxAmount: { currency: "USD", minorUnits: 5000 } };
  assert.deepEqual(
    (await provider.searchOpportunities(query)).map((item) => item.id),
    ["example-transit"],
  );
  assert.deepEqual(
    await provider.searchOpportunities({
      maxAmount: { currency: "USD", minorUnits: 2000 },
    }),
    [],
  );
});

test("category filters and missing IDs have predictable behavior", async () => {
  const provider = createReferenceProvider();
  assert.deepEqual(
    (await provider.searchOpportunities({ category: "food" })).map(
      (item) => item.id,
    ),
    ["example-food"],
  );
  assert.equal(await provider.getOpportunity("missing"), null);
});

test("public projection strips internal fields, including nested fields", async () => {
  const [base] = await createReferenceProvider().searchOpportunities();
  const result = projectPublicOpportunity({
    ...base,
    legalName: "PRIVATE LEGAL NAME",
    caseNotes: "PRIVATE CASE NOTES",
    organization: { ...base.organization, apiKey: "PRIVATE KEY" },
    amount: { ...base.amount, processorAccount: "PRIVATE ACCOUNT" },
    location: { ...base.location, streetAddress: "PRIVATE ADDRESS" },
  });
  assert.deepEqual(result, base);
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
});

test("returned objects cannot mutate later provider results", async () => {
  const provider = createReferenceProvider();
  const [first] = await provider.searchOpportunities();
  first.amount.minorUnits = 1;
  first.organization.displayName = "changed";
  const fresh = await provider.getOpportunity(first.id);
  assert.equal(fresh.amount.minorUnits, 2500);
  assert.equal(fresh.organization.displayName, "Synthetic Example Nonprofit");
  const info = await provider.getProvider();
  info.capabilities.currencies.push("EUR");
  assert.deepEqual((await provider.getProvider()).capabilities.currencies, [
    "USD",
    "CAD",
  ]);
});

test("conformance detects wrong providers, unavailable items, and leaked fields", async () => {
  const provider = createReferenceProvider();
  const [item] = await provider.searchOpportunities();
  const broken = {
    ...provider,
    async searchOpportunities() {
      return [
        {
          ...item,
          providerId: "wrong",
          status: "withdrawn",
          privateNotes: "PRIVATE",
        },
      ];
    },
  };
  const failures = await checkReadonlyProvider(broken);
  assert.ok(failures.some((value) => value.startsWith("Provider mismatch")));
  assert.ok(
    failures.some((value) => value.startsWith("Unavailable search result")),
  );
  assert.ok(
    failures.some((value) => value.startsWith("Unexpected public fields")),
  );
});
