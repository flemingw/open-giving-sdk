import { randomUUID } from "node:crypto";
import {
  GivingError,
  projectPublicOpportunity,
  validateMoney,
  matchesQuery,
} from "@open-giving/protocol";
import type {
  ProviderInfo,
  PublicOpportunity,
  Quote,
  CheckoutSession,
  ContributionStatus,
} from "@open-giving/protocol";
import type { ContributionProviderAdapter } from "@open-giving/provider-sdk";

const provider: ProviderInfo = {
  id: "synthetic-provider",
  displayName: "Synthetic Example Nonprofit",
  verification: "sandbox",
  capabilities: {
    currencies: ["USD", "CAD"],
    fundingModels: ["exact", "partial"],
    completionModes: ["browser_handoff"],
  },
};

const fixtures: PublicOpportunity[] = [
  {
    providerId: provider.id,
    id: "example-transit",
    organization: {
      id: "example-org",
      displayName: "Synthetic Example Nonprofit",
    },
    title: "Example transit pass",
    summary:
      "Synthetic example: help cover a transit pass. No real person is represented.",
    category: "transportation",
    amount: { currency: "USD", minorUnits: 2500 },
    fundingModel: "exact",
    status: "available",
    updatedAt: "2026-10-17T00:00:00Z",
    disclosure: "Demonstration only. No payment is accepted.",
    location: { countryCode: "US", region: "MA", locality: "Boston" },
  },
  {
    providerId: provider.id,
    id: "example-food",
    organization: {
      id: "example-org",
      displayName: "Synthetic Example Nonprofit",
    },
    title: "Example food support",
    summary:
      "Synthetic example: contribute toward food support. No real person is represented.",
    category: "food",
    amount: { currency: "CAD", minorUnits: 4000 },
    fundingModel: "partial",
    status: "available",
    updatedAt: "2026-10-17T00:00:00Z",
    disclosure: "Demonstration only. No payment is accepted.",
    location: { countryCode: "CA", region: "ON", locality: "Toronto" },
  },
];

export function createReferenceProvider(
  options: { clock?: () => number } = {},
): ContributionProviderAdapter & {
  confirmForTest: (id: string) => void;
} {
  const now = options.clock ?? Date.now;
  const rows = fixtures.map(projectPublicOpportunity);
  const quotes = new Map<string, { principalId: string; quote: Quote }>();
  const contributions = new Map<
    string,
    { principalId: string; value: ContributionStatus; expires: number }
  >();
  const replays = new Map<
    string,
    { quoteId: string; session: CheckoutSession }
  >();
  const holds = new Map<string, string>();
  function expireHolds() {
    for (const [id, item] of contributions) {
      if (item.value.status === "pending" && item.expires <= now()) {
        item.value.status = "expired";
        item.value.updatedAt = new Date(now()).toISOString();
        if (holds.get(item.value.opportunityId) === id)
          holds.delete(item.value.opportunityId);
      }
    }
  }
  return {
    async getProvider() {
      return {
        ...provider,
        capabilities: {
          currencies: [...provider.capabilities.currencies],
          fundingModels: [...provider.capabilities.fundingModels],
          completionModes: ["browser_handoff"],
        },
      };
    },
    async searchOpportunities(query = {}) {
      if (query.maxAmount) validateMoney(query.maxAmount);
      expireHolds();
      return rows
        .filter((item) => !holds.has(item.id) && matchesQuery(item, query))
        .map(projectPublicOpportunity);
    },
    async getOpportunity(id) {
      const item = rows.find((value) => value.id === id);
      return item ? projectPublicOpportunity(item) : null;
    },
    async quoteContribution(input, context) {
      expireHolds();
      const item = rows.find((value) => value.id === input.opportunityId);
      if (!item || item.status !== "available" || holds.has(item.id))
        throw new GivingError(
          "opportunity_unavailable",
          "Opportunity is unavailable",
        );
      validateMoney(input.amount);
      if (
        input.providerId !== provider.id ||
        input.amount.currency !== item.amount.currency ||
        input.amount.minorUnits <= 0 ||
        input.amount.minorUnits > item.amount.minorUnits ||
        (item.fundingModel === "exact" &&
          input.amount.minorUnits !== item.amount.minorUnits)
      ) {
        throw new GivingError(
          "invalid_request",
          "Amount does not match funding rules",
        );
      }
      const quote: Quote = {
        id: randomUUID(),
        providerId: provider.id,
        opportunityId: item.id,
        organization: { ...item.organization },
        amount: { ...input.amount },
        fees: { currency: input.amount.currency, minorUnits: 0 },
        total: { ...input.amount },
        expiresAt: new Date(now() + 600000).toISOString(),
        terms: "Synthetic demonstration only. No real money moves.",
        refundPolicy: "No payment is taken, so no refund applies.",
        completionMode: "browser_handoff",
      };
      quotes.set(quote.id, { principalId: context.principalId, quote });
      return structuredClone(quote);
    },
    async createCheckoutSession(input, context) {
      expireHolds();
      const key = `${context.principalId}:${input.idempotencyKey}`;
      const replay = replays.get(key);
      if (replay) {
        if (replay.quoteId !== input.quoteId)
          throw new GivingError(
            "idempotency_conflict",
            "The idempotency key was used for a different quote",
          );
        return structuredClone(replay.session);
      }
      const stored = quotes.get(input.quoteId);
      if (!stored || stored.principalId !== context.principalId)
        throw new GivingError("not_found", "Quote was not found");
      const quote = stored.quote;
      if (Date.parse(quote.expiresAt) <= now())
        throw new GivingError("quote_expired", "The quote has expired");
      const item = rows.find((value) => value.id === quote.opportunityId);
      if (!item || item.status !== "available" || holds.has(item.id))
        throw new GivingError(
          "opportunity_unavailable",
          "Opportunity is unavailable",
        );
      // No await between checking availability and acquiring the in-memory hold.
      // Real providers must use a database transaction across all checkout channels.
      const id = randomUUID();
      const contribution: ContributionStatus = {
        id,
        providerId: provider.id,
        opportunityId: item.id,
        quoteId: quote.id,
        amount: { ...quote.amount },
        status: "pending",
        updatedAt: new Date(now()).toISOString(),
      };
      const session: CheckoutSession = {
        contribution,
        checkoutUrl: `https://example.invalid/synthetic-checkout/${id}`,
        expiresAt: quote.expiresAt,
      };
      holds.set(item.id, id);
      contributions.set(id, {
        principalId: context.principalId,
        value: structuredClone(contribution),
        expires: Date.parse(quote.expiresAt),
      });
      replays.set(key, {
        quoteId: quote.id,
        session: structuredClone(session),
      });
      return structuredClone(session);
    },
    async getContributionStatus(id, context) {
      expireHolds();
      const item = contributions.get(id);
      return item?.principalId === context.principalId
        ? structuredClone(item.value)
        : null;
    },
    confirmForTest(id) {
      expireHolds();
      const contribution = contributions.get(id);
      if (!contribution || contribution.value.status !== "pending")
        throw new Error("No pending synthetic contribution");
      const item = rows.find(
        (value) => value.id === contribution.value.opportunityId,
      )!;
      item.amount.minorUnits -= contribution.value.amount.minorUnits;
      if (item.amount.minorUnits === 0) item.status = "funded";
      item.updatedAt = new Date(now()).toISOString();
      contribution.value.status = "confirmed";
      contribution.value.updatedAt = item.updatedAt;
      holds.delete(item.id);
    },
  };
}
