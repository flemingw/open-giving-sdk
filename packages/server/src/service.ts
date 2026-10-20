import { createHash } from "node:crypto";
import {
  GivingError,
  PublicOpportunitySchema,
  QuoteSchema,
  CheckoutSessionSchema,
  ContributionStatusSchema,
  SearchInputSchema,
  GetOpportunityInputSchema,
  QuoteInputSchema,
  CheckoutInputSchema,
  StatusInputSchema,
  PrepareGiftInputSchema,
  PreparedGiftSchema,
  PreparedCheckoutSchema,
  PrepareCheckoutInputSchema,
  matchesQuery,
} from "@open-giving/protocol";
import type {
  SearchInput,
  PublicOpportunity,
  Money,
} from "@open-giving/protocol";
import type { ProviderContext } from "@open-giving/provider-sdk";
import { ProviderRegistry } from "@open-giving/registry";
export { createSetupGuide } from "./onboarding.js";

export const SCOPES = [
  "opportunities:read",
  "quotes:write",
  "checkout:write",
  "contributions:read",
] as const;
export type Scope = (typeof SCOPES)[number];
export interface Principal {
  id: string;
  clientId: string;
  scopes: readonly Scope[];
}

function requireScope(principal: Principal, scope: Scope): void {
  if (!principal.scopes.includes(scope))
    throw new GivingError(
      "forbidden",
      "The credential does not permit this operation",
    );
}
function remaining(item: PublicOpportunity): number {
  const value = item.amountRemaining ?? item.amount;
  if (
    value.currency !== item.amount.currency ||
    value.minorUnits > item.amount.minorUnits ||
    (item.status === "available" &&
      (value.minorUnits <= 0 ||
        (item.fundingModel === "exact" &&
          value.minorUnits !== item.amount.minorUnits)))
  )
    throw new GivingError(
      "provider_unavailable",
      "Provider returned inconsistent funding amounts",
    );
  return value.minorUnits;
}
function validateGiftAmount(item: PublicOpportunity, amount: Money): void {
  if (
    amount.currency !== item.amount.currency ||
    amount.minorUnits <= 0 ||
    amount.minorUnits > remaining(item) ||
    (item.fundingModel === "exact" &&
      amount.minorUnits !== item.amount.minorUnits)
  )
    throw new GivingError(
      "invalid_request",
      "The amount does not match this opportunity's funding rules",
    );
}
function parse<T>(
  schema: {
    safeParse(input: unknown): { success: true; data: T } | { success: false };
  },
  input: unknown,
): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new GivingError(
      "invalid_request",
      "Arguments do not match the documented schema",
    );
  return parsed.data;
}
function context(principal: Principal, requestId: string): ProviderContext {
  return { principalId: principal.id, clientId: principal.clientId, requestId };
}
function queryKey(query: SearchInput): string {
  const { cursor: _cursor, ...filters } = query;
  return createHash("sha256")
    .update(JSON.stringify(filters))
    .digest("hex")
    .slice(0, 24);
}
function cursorOffset(cursor: string | undefined, fingerprint: string): number {
  if (!cursor) return 0;
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString(),
    );
    if (
      typeof decoded === "object" &&
      decoded !== null &&
      "offset" in decoded &&
      "key" in decoded &&
      decoded.key === fingerprint &&
      Number.isSafeInteger(decoded.offset) &&
      typeof decoded.offset === "number" &&
      decoded.offset >= 0
    )
      return decoded.offset;
  } catch {
    /* Return a safe error without echoing the cursor. */
  }
  throw new GivingError(
    "invalid_request",
    "The cursor is invalid for these filters",
  );
}

export class GivingService {
  constructor(
    public readonly registry: ProviderRegistry,
    private clock: () => number = Date.now,
  ) {}
  async listProviders(principal: Principal) {
    requireScope(principal, "opportunities:read");
    return { providers: await this.registry.list() };
  }
  private async searchPages(query: SearchInput, principal: Principal) {
    const providers = query.providerId
      ? [await this.registry.info(query.providerId)]
      : await this.registry.list();
    const key = queryKey(query);
    let index = 0;
    let after: string | undefined;
    if (query.cursor) {
      try {
        const value = JSON.parse(
          Buffer.from(query.cursor, "base64url").toString(),
        );
        if (
          value.key !== key ||
          value.paged !== true ||
          !Number.isSafeInteger(value.index) ||
          value.index < 0 ||
          value.index >= providers.length ||
          (value.after !== undefined &&
            (typeof value.after !== "string" || value.after.length > 2048))
        )
          throw Error();
        index = value.index;
        after = value.after;
      } catch {
        throw new GivingError(
          "invalid_request",
          "The cursor is invalid for these filters",
        );
      }
    }
    const { providerId: _provider, limit, cursor: _cursor, ...filters } = query;
    const opportunities: PublicOpportunity[] = [];
    while (index < providers.length && opportunities.length < limit) {
      const info = providers[index]!;
      const adapter = this.registry.get(info.id);
      const count = limit - opportunities.length;
      let page: { opportunities: PublicOpportunity[]; nextCursor?: string };
      if (adapter.searchOpportunitiesPage) {
        page = await adapter.searchOpportunitiesPage(filters, {
          limit: count,
          ...(after ? { cursor: after } : {}),
        });
      } else {
        const offset = after === undefined ? 0 : Number(after);
        if (!Number.isSafeInteger(offset) || offset < 0)
          throw new GivingError("invalid_request", "Invalid provider cursor");
        const rows = (await adapter.searchOpportunities(filters)).filter(
          (row) => matchesQuery(row, filters),
        );
        page = {
          opportunities: rows.slice(offset, offset + count),
          ...(offset + count < rows.length
            ? { nextCursor: String(offset + count) }
            : {}),
        };
      }
      if (
        page.opportunities.length > count ||
        (page.nextCursor !== undefined &&
          (!page.nextCursor ||
            page.nextCursor.length > 2048 ||
            page.nextCursor === after))
      ) {
        throw new GivingError(
          "provider_unavailable",
          "Provider returned an invalid page",
        );
      }
      const seen = new Set<string>();
      for (const raw of page.opportunities) {
        const item = PublicOpportunitySchema.parse(raw);
        remaining(item);
        if (
          item.providerId !== info.id ||
          seen.has(item.id) ||
          !info.capabilities.currencies.includes(item.amount.currency) ||
          !info.capabilities.fundingModels.includes(item.fundingModel) ||
          !matchesQuery(item, filters)
        ) {
          throw new GivingError(
            "provider_unavailable",
            "Provider returned an inconsistent opportunity",
          );
        }
        seen.add(item.id);
        opportunities.push(item);
      }
      if (page.nextCursor !== undefined) {
        after = page.nextCursor;
        break;
      }
      index++;
      after = undefined;
    }
    return {
      opportunities,
      ...(index < providers.length
        ? {
            nextCursor: Buffer.from(
              JSON.stringify({
                key,
                paged: true,
                index,
                ...(after ? { after } : {}),
              }),
            ).toString("base64url"),
          }
        : {}),
    };
  }
  async search(input: unknown, principal: Principal) {
    requireScope(principal, "opportunities:read");
    const query = parse(SearchInputSchema, input);
    const key = queryKey(query);
    const providers = query.providerId
      ? [await this.registry.info(query.providerId)]
      : await this.registry.list();
    const { providerId: _provider, limit, cursor: _cursor, ...filters } = query;
    if (
      providers.some(
        (info) => this.registry.get(info.id).searchOpportunitiesPage,
      )
    ) {
      return this.searchPages(query, principal);
    }
    const offset = cursorOffset(query.cursor, key);
    const batches = await Promise.all(
      providers.map(async (info) => {
        const rows = await this.registry
          .get(info.id)
          .searchOpportunities(filters);
        const seen = new Set<string>();
        return rows
          .map((row) => {
            const item = PublicOpportunitySchema.parse(row);
            remaining(item);
            if (
              item.providerId !== info.id ||
              seen.has(item.id) ||
              !info.capabilities.currencies.includes(item.amount.currency) ||
              !info.capabilities.fundingModels.includes(item.fundingModel)
            ) {
              throw new GivingError(
                "provider_unavailable",
                "Provider returned an inconsistent opportunity",
              );
            }
            seen.add(item.id);
            return item;
          })
          .filter((item) => matchesQuery(item, filters));
      }),
    );
    const all = batches.flat().sort((a, b) => {
      // Prefer opportunities the budget can finish before partial contributions.
      const finishes = query.maxAmount
        ? Number(remaining(b) <= query.maxAmount.minorUnits) -
          Number(remaining(a) <= query.maxAmount.minorUnits)
        : 0;
      const budgetFit = query.maxAmount ? remaining(b) - remaining(a) : 0;
      return (
        finishes ||
        budgetFit ||
        a.providerId.localeCompare(b.providerId) ||
        a.id.localeCompare(b.id)
      );
    });
    const result: { opportunities: PublicOpportunity[]; nextCursor?: string } =
      {
        opportunities: all.slice(offset, offset + limit),
      };
    if (offset + limit < all.length) {
      result.nextCursor = Buffer.from(
        JSON.stringify({ offset: offset + limit, key }),
      ).toString("base64url");
    }
    return result;
  }
  async get(input: unknown, principal: Principal) {
    requireScope(principal, "opportunities:read");
    const args = parse(GetOpportunityInputSchema, input);
    const info = await this.registry.info(args.providerId);
    const raw = await this.registry
      .get(args.providerId)
      .getOpportunity(args.opportunityId);
    if (!raw) throw new GivingError("not_found", "Opportunity was not found");
    const item = PublicOpportunitySchema.parse(raw);
    remaining(item);
    if (
      item.providerId !== info.id ||
      item.id !== args.opportunityId ||
      !info.capabilities.currencies.includes(item.amount.currency) ||
      !info.capabilities.fundingModels.includes(item.fundingModel)
    ) {
      throw new GivingError(
        "provider_unavailable",
        "Provider returned an inconsistent opportunity",
      );
    }
    if (item.status !== "available")
      throw new GivingError(
        "opportunity_unavailable",
        "Opportunity is no longer available",
      );
    return { opportunity: item };
  }
  async quote(input: unknown, principal: Principal, requestId: string) {
    requireScope(principal, "quotes:write");
    const args = parse(QuoteInputSchema, input);
    const adapter = this.registry.get(args.providerId);
    const info = await this.registry.info(args.providerId);
    if (
      !adapter.quoteContribution ||
      info.capabilities.completionModes.length === 0
    ) {
      throw new GivingError(
        "unsupported_capability",
        "This provider does not support contributions yet",
      );
    }
    const { opportunity } = await this.get(
      { providerId: args.providerId, opportunityId: args.opportunityId },
      principal,
    );
    validateGiftAmount(opportunity, args.amount);
    const quote = QuoteSchema.parse(
      await adapter.quoteContribution(args, context(principal, requestId)),
    );
    if (
      quote.providerId !== args.providerId ||
      quote.opportunityId !== args.opportunityId ||
      quote.organization.id !== opportunity.organization.id ||
      quote.amount.currency !== args.amount.currency ||
      quote.amount.minorUnits !== args.amount.minorUnits ||
      quote.fees.currency !== quote.amount.currency ||
      quote.total.currency !== quote.amount.currency ||
      quote.total.minorUnits !==
        quote.amount.minorUnits + quote.fees.minorUnits ||
      !info.capabilities.completionModes.includes(quote.completionMode)
    ) {
      throw new GivingError(
        "provider_unavailable",
        "Provider returned an inconsistent quote",
      );
    }
    if (Date.parse(quote.expiresAt) <= this.clock())
      throw new GivingError("quote_expired", "The quote has expired");
    return { quote };
  }
  async prepareGift(input: unknown, principal: Principal) {
    requireScope(principal, "opportunities:read");
    const args = parse(PrepareGiftInputSchema, input);
    const adapter = this.registry.get(args.providerId);
    if (!adapter.prepareGift)
      throw new GivingError(
        "unsupported_capability",
        "Public gift review links are unavailable",
      );
    const { opportunity } = await this.get(
      { providerId: args.providerId, opportunityId: args.opportunityId },
      principal,
    );
    validateGiftAmount(opportunity, args.amount);
    const gift = PreparedGiftSchema.parse(await adapter.prepareGift(args));
    if (
      gift.providerId !== args.providerId ||
      gift.opportunityId !== args.opportunityId ||
      gift.amount.currency !== args.amount.currency ||
      gift.amount.minorUnits !== args.amount.minorUnits
    )
      throw new GivingError(
        "provider_unavailable",
        "Provider returned an inconsistent review link",
      );
    const destination = new URL(gift.reviewUrl);
    if (destination.username || destination.password || destination.hash)
      throw new GivingError(
        "provider_unavailable",
        "Provider returned an invalid review link",
      );
    return { gift };
  }
  async checkout(input: unknown, principal: Principal, requestId: string) {
    requireScope(principal, "checkout:write");
    const args = parse(CheckoutInputSchema, input);
    const adapter = this.registry.get(args.providerId);
    const info = await this.registry.info(args.providerId);
    if (
      !adapter.createCheckoutSession ||
      !info.capabilities.completionModes.includes("browser_handoff")
    ) {
      throw new GivingError(
        "unsupported_capability",
        "This provider does not support checkout handoff",
      );
    }
    const checkout = CheckoutSessionSchema.parse(
      await adapter.createCheckoutSession(args, context(principal, requestId)),
    );
    if (
      checkout.contribution.providerId !== args.providerId ||
      checkout.contribution.quoteId !== args.quoteId ||
      !["approval_required", "pending"].includes(checkout.contribution.status)
    ) {
      throw new GivingError(
        "provider_unavailable",
        "Provider returned an inconsistent checkout",
      );
    }
    return { checkout };
  }
  async prepareCheckout(
    input: unknown,
    principal: Principal,
    requestId: string,
  ) {
    requireScope(principal, "checkout:write");
    // Revalidation also requires discovery scope. Model arguments grant no consent.
    const args = parse(PrepareCheckoutInputSchema, input);
    const adapter = this.registry.get(args.providerId);
    const info = await this.registry.info(args.providerId);
    if (!adapter.prepareCheckout || !info.capabilities.checkoutPreparation)
      throw new GivingError(
        "unsupported_capability",
        "Direct checkout preparation is unavailable",
      );
    const { opportunity } = await this.get(
      { providerId: args.providerId, opportunityId: args.opportunityId },
      principal,
    );
    validateGiftAmount(opportunity, args.amount);
    let checkout;
    try {
      checkout = PreparedCheckoutSchema.parse(
        await adapter.prepareCheckout(args, context(principal, requestId)),
      );
    } catch (error) {
      if (error instanceof GivingError) throw error;
      throw new GivingError(
        "provider_unavailable",
        "Checkout outcome is uncertain; do not retry automatically",
      );
    }
    const destination = new URL(checkout.checkoutUrl);
    if (
      checkout.providerId !== args.providerId ||
      checkout.opportunityId !== args.opportunityId ||
      checkout.expectedAmount.currency !== args.amount.currency ||
      checkout.expectedAmount.minorUnits !== args.amount.minorUnits ||
      destination.username ||
      destination.password
    )
      throw new GivingError(
        "provider_unavailable",
        "Provider returned an inconsistent checkout; do not retry automatically",
      );
    return { checkout };
  }
  async status(input: unknown, principal: Principal, requestId: string) {
    requireScope(principal, "contributions:read");
    const args = parse(StatusInputSchema, input);
    const adapter = this.registry.get(args.providerId);
    if (!adapter.getContributionStatus)
      throw new GivingError(
        "unsupported_capability",
        "This provider does not expose contribution status",
      );
    const raw = await adapter.getContributionStatus(
      args.contributionId,
      context(principal, requestId),
    );
    if (!raw) throw new GivingError("not_found", "Contribution was not found");
    const contribution = ContributionStatusSchema.parse(raw);
    if (
      contribution.id !== args.contributionId ||
      contribution.providerId !== args.providerId
    ) {
      throw new GivingError(
        "provider_unavailable",
        "Provider returned an inconsistent contribution",
      );
    }
    return { contribution };
  }
}
