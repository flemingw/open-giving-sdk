import { projectPublicOpportunity, validateMoney } from "@open-giving/protocol";
import type { ReadonlyProviderAdapter } from "@open-giving/provider-sdk";
import type {
  ContributionProviderAdapter,
  ProviderContext,
} from "@open-giving/provider-sdk";
import {
  QuoteSchema,
  CheckoutSessionSchema,
  ContributionStatusSchema,
  ProviderInfoSchema,
  type Money,
} from "@open-giving/protocol";

/** Read-only setup diagnostics. This checks declarations/wiring, NOT legal
 * verification, payment eligibility or production safety. Never starts a gift. */
export async function diagnoseProvider(
  adapter: ContributionProviderAdapter,
): Promise<{
  providerId?: string;
  issues: string[];
  operations: {
    discovery: boolean;
    quote: boolean;
    browserHandoff: boolean;
    checkoutPreparation: boolean;
    status: boolean;
  };
}> {
  const operations = {
    discovery: false,
    quote: false,
    browserHandoff: false,
    checkoutPreparation: false,
    status: false,
  };
  const issues: string[] = [];
  let raw: unknown;
  try {
    raw = await adapter.getProvider();
  } catch {
    return {
      issues: [
        "Provider metadata is unavailable; check the origin, scoped read credential and provider feature flag.",
      ],
      operations,
    };
  }
  const result = ProviderInfoSchema.safeParse(raw);
  if (!result.success)
    return {
      issues: ["Provider metadata does not match the protocol schema."],
      operations,
    };
  const provider = result.data;
  operations.discovery = true;
  operations.quote =
    !!adapter.quoteContribution &&
    provider.capabilities.completionModes.length > 0;
  operations.browserHandoff =
    operations.quote &&
    !!adapter.createCheckoutSession &&
    provider.capabilities.completionModes.includes("browser_handoff");
  operations.status = !!adapter.getContributionStatus;
  operations.checkoutPreparation =
    !!adapter.prepareCheckout &&
    provider.capabilities.checkoutPreparation === true;
  if (
    provider.capabilities.checkoutPreparation &&
    !operations.checkoutPreparation
  )
    issues.push(
      "Direct checkout preparation is advertised without an implementation.",
    );
  if (
    provider.capabilities.completionModes.includes("browser_handoff") &&
    !operations.browserHandoff
  )
    issues.push(
      "Browser handoff is advertised without both quote and checkout implementations.",
    );
  if (provider.capabilities.completionModes.length > 0 && !operations.status)
    issues.push(
      "Contributions are advertised without private contribution-status recovery.",
    );
  if (provider.capabilities.completionModes.includes("native"))
    issues.push(
      "Native completion needs a separately tested platform transaction contract; this SDK handoff interface alone does not implement it.",
    );
  if (
    provider.capabilities.completionModes.length === 0 &&
    !operations.checkoutPreparation
  )
    issues.push(
      "No checkout capability is advertised. A public review link, if supported, is not payment execution.",
    );
  if (operations.checkoutPreparation)
    issues.push(
      "Direct session preparation is state-changing, is not assumed idempotent, and does not prove a locked price, payment or private status recovery.",
    );
  if (provider.verification !== "verified")
    issues.push(
      "This is not a host-approved production provider. A sandbox/applicant label is not charity verification.",
    );
  return { providerId: provider.id, issues, operations };
}

/** Initial read checks only, not a certification or full schema validator. */
export async function checkReadonlyProvider(
  adapter: ReadonlyProviderAdapter,
): Promise<string[]> {
  const failures: string[] = [];
  const provider = await adapter.getProvider();
  const opportunities = await adapter.searchOpportunities();
  const ids = new Set<string>();
  for (const item of opportunities) {
    if (ids.has(item.id)) failures.push(`Duplicate opportunity: ${item.id}`);
    ids.add(item.id);
    if (item.providerId !== provider.id)
      failures.push(`Provider mismatch: ${item.id}`);
    if (item.status !== "available")
      failures.push(`Unavailable search result: ${item.id}`);
    if (!provider.capabilities.currencies.includes(item.amount.currency)) {
      failures.push(`Undeclared currency: ${item.id}`);
    }
    if (!provider.capabilities.fundingModels.includes(item.fundingModel)) {
      failures.push(`Undeclared funding model: ${item.id}`);
    }
    try {
      validateMoney(item.amount);
      if (
        JSON.stringify(item) !== JSON.stringify(projectPublicOpportunity(item))
      ) {
        // Compare parsed key sets independently of property insertion order.
        const canonical = (v: unknown): string => {
          if (v === null || typeof v !== "object")
            return JSON.stringify(v) ?? "null";
          if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
          const entries = Object.entries(v).sort(([a], [b]) =>
            a.localeCompare(b),
          );
          return `{${entries.map(([k, value]) => `${JSON.stringify(k)}:${canonical(value)}`).join(",")}}`;
        };
        if (canonical(item) !== canonical(projectPublicOpportunity(item))) {
          failures.push(`Unexpected public fields: ${item.id}`);
        }
      }
    } catch {
      failures.push(`Invalid money/public projection: ${item.id}`);
    }
    const fetched = await adapter.getOpportunity(item.id);
    if (
      !fetched ||
      fetched.id !== item.id ||
      fetched.providerId !== provider.id
    ) {
      failures.push(`Search/get mismatch: ${item.id}`);
    }
  }
  return failures;
}

/** Mutating conformance is opt-in and sandbox-only. A sandbox label from an
 * unknown adapter is not proof: the operator must approve its target/credentials.
 * Use a fresh synthetic fixture because this test reserves inventory.
 */
export async function checkSandboxContributionProvider(
  adapter: ContributionProviderAdapter,
  scenario: {
    operatorApprovedSandbox: true;
    opportunityId: string;
    amount: Money;
    context: ProviderContext;
  },
): Promise<string[]> {
  const failures = await checkReadonlyProvider(adapter);
  const info = await adapter.getProvider();
  if (
    scenario.operatorApprovedSandbox !== true ||
    info.verification !== "sandbox"
  )
    throw new Error(
      "Mutating conformance requires an explicitly approved sandbox",
    );
  if (
    !adapter.quoteContribution ||
    !adapter.createCheckoutSession ||
    !adapter.getContributionStatus
  )
    return [...failures, "Missing contribution methods"];
  const quote = QuoteSchema.parse(
    await adapter.quoteContribution(
      {
        providerId: info.id,
        opportunityId: scenario.opportunityId,
        amount: scenario.amount,
      },
      scenario.context,
    ),
  );
  if (
    quote.providerId !== info.id ||
    quote.opportunityId !== scenario.opportunityId ||
    quote.amount.currency !== scenario.amount.currency ||
    quote.amount.minorUnits !== scenario.amount.minorUnits ||
    quote.total.minorUnits !==
      quote.amount.minorUnits + quote.fees.minorUnits ||
    quote.total.currency !== quote.amount.currency ||
    quote.fees.currency !== quote.amount.currency
  )
    failures.push("Inconsistent quote terms");
  const input = {
    quoteId: quote.id,
    idempotencyKey: `conformance-${crypto.randomUUID()}`,
  };
  const session = CheckoutSessionSchema.parse(
    await adapter.createCheckoutSession(input, scenario.context),
  );
  const replay = CheckoutSessionSchema.parse(
    await adapter.createCheckoutSession(input, scenario.context),
  );
  if (
    session.contribution.id !== replay.contribution.id ||
    session.checkoutUrl !== replay.checkoutUrl
  )
    failures.push("Checkout replay is not idempotent");
  if (!["approval_required", "pending"].includes(session.contribution.status))
    failures.push("Checkout cannot prove payment confirmation");
  const contribution = await adapter.getContributionStatus(
    session.contribution.id,
    scenario.context,
  );
  if (
    !contribution ||
    ContributionStatusSchema.parse(contribution).quoteId !== quote.id
  )
    failures.push("Status does not match original quote");
  const other = await adapter.getContributionStatus(session.contribution.id, {
    ...scenario.context,
    principalId: "conformance-other-principal",
  });
  if (other) failures.push("Contribution status is not caller-isolated");
  return failures;
}
