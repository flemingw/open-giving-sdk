import type {
  OpportunityQuery,
  ProviderInfo,
  PublicOpportunity,
  QuoteInput,
  Quote,
  CheckoutSession,
  ContributionStatus,
  PreparedGift,
  PreparedCheckout,
  PrepareCheckoutInput,
} from "@open-giving/protocol";

/** Provider implementation owns its data sources; this SDK creates no database. */
export interface ReadonlyProviderAdapter {
  getProvider(): Promise<ProviderInfo>;
  searchOpportunities(query?: OpportunityQuery): Promise<PublicOpportunity[]>;
  getOpportunity(id: string): Promise<PublicOpportunity | null>;
  /** Native cursor pagination. Preferred over loading a provider's entire feed. */
  searchOpportunitiesPage?(
    query: OpportunityQuery,
    page: { limit: number; cursor?: string },
  ): Promise<{ opportunities: PublicOpportunity[]; nextCursor?: string }>;
}

/** The provider host supplies an authorized caller or narrowly scoped guest
 * context, never an identity asserted in tool arguments. A principal is NOT an
 * Open Giving account: this SDK registers no donors and stores no preferences. */
export interface ProviderContext {
  principalId: string;
  clientId: string;
  requestId: string;
}

export interface ContributionProviderAdapter extends ReadonlyProviderAdapter {
  /** Pure link preparation only. Must not persist, reserve, send or charge. */
  prepareGift?(input: QuoteInput): Promise<PreparedGift>;
  /** Creates an existing provider checkout session. State-changing and NOT
   * assumed idempotent. Get donor approval first; never retry an ambiguous result. */
  prepareCheckout?(
    input: PrepareCheckoutInput,
    context: ProviderContext,
  ): Promise<PreparedCheckout>;
  quoteContribution?(
    input: QuoteInput,
    context: ProviderContext,
  ): Promise<Quote>;
  createCheckoutSession?(
    input: { quoteId: string; idempotencyKey: string },
    context: ProviderContext,
  ): Promise<CheckoutSession>;
  getContributionStatus?(
    id: string,
    context: ProviderContext,
  ): Promise<ContributionStatus | null>;
}
