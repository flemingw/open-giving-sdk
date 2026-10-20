import { createReferenceProvider } from "@open-giving/reference-provider";
import { checkReadonlyProvider } from "@open-giving/conformance";

const provider = createReferenceProvider();
const failures = await checkReadonlyProvider(provider);
if (failures.length) throw new Error(failures.join("\n"));
console.log(
  JSON.stringify(
    {
      environment: "synthetic-demo",
      provider: await provider.getProvider(),
      opportunities: await provider.searchOpportunities({
        maxAmount: { currency: "USD", minorUnits: 5000 },
      }),
      conformance: "initial read checks passed",
    },
    null,
    2,
  ),
);
