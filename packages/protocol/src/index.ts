import { z } from "zod";

export const PROTOCOL_VERSION = "0.1.0";
export const IdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const MoneySchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  minorUnits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export const LocationSchema = z.object({
  displayName: z.string().min(1).max(1000).optional(),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  region: z.string().min(1).max(80).optional(),
  locality: z.string().min(1).max(100).optional(),
});
export const OrganizationSchema = z.object({
  id: IdSchema,
  displayName: z.string().min(1).max(256),
});
export const VerificationSchema = z.enum([
  "applicant",
  "sandbox",
  "verified",
  "suspended",
  "removed",
]);
export const ProviderInfoSchema = z.object({
  id: IdSchema,
  displayName: z.string().min(1).max(256),
  verification: VerificationSchema,
  capabilities: z.object({
    currencies: z.array(z.string().regex(/^[A-Z]{3}$/)).min(1),
    fundingModels: z.array(z.enum(["exact", "partial"])).min(1),
    completionModes: z.array(z.enum(["browser_handoff", "native"])),
    /** Direct session preparation, without requiring the optional quote API. */
    checkoutPreparation: z
      .boolean()
      .optional()
      .describe(
        "Whether the provider can create an existing checkout session without a quote API. This is a state-changing operation, not a confirmed payment.",
      ),
  }),
});
export const PublicOpportunitySchema = z.object({
  providerId: IdSchema,
  id: IdSchema,
  organization: OrganizationSchema,
  title: z.string().min(1).max(256),
  summary: z.string().min(1).max(10000),
  category: z.string().min(1).max(200),
  amount: MoneySchema.describe(
    "Provider-published need amount. Exact gifts use the full card value; partial providers can separately report the amount still needed.",
  ),
  /** Optional provider-owned facts; omit unavailable dates rather than inventing them. */
  amountRemaining: MoneySchema.optional().describe(
    "Provider-reported remaining amount in the same currency, no greater than amount. Omit when unknown; never infer partial progress.",
  ),
  dateNeededBy: z.iso.date().optional(),
  givingUrl: z.url({ protocol: /^https$/ }).optional(),
  fundingModel: z.enum(["exact", "partial"]),
  status: z.enum(["available", "funded", "withdrawn"]),
  updatedAt: z.iso
    .datetime({ offset: true })
    .optional()
    .describe(
      "Provider-reported update timestamp. Omit when unavailable; the request time is not an update timestamp.",
    ),
  disclosure: z.string().min(1).max(2000),
  location: LocationSchema.optional(),
});
export const OpportunityQuerySchema = z.strictObject({
  category: z.string().min(1).max(200).optional(),
  maxAmount: MoneySchema.strict().optional(),
  location: z.string().min(1).max(1000).optional(),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  region: z.string().min(1).max(80).optional(),
  locality: z.string().min(1).max(100).optional(),
});
export const SearchInputSchema = OpportunityQuerySchema.extend({
  providerId: IdSchema.optional(),
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(4096).optional(),
});
export const GetOpportunityInputSchema = z.strictObject({
  providerId: IdSchema,
  opportunityId: IdSchema,
});
export const QuoteInputSchema = GetOpportunityInputSchema.extend({
  amount: MoneySchema.strict(),
});
export const PrepareCheckoutInputSchema = QuoteInputSchema.extend({
  source: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
});
export const PrepareGiftInputSchema = QuoteInputSchema;
/** A public review link, not a reservation, payment session or authorization. */
export const PreparedGiftSchema = z.object({
  providerId: IdSchema,
  opportunityId: IdSchema,
  amount: MoneySchema,
  reviewUrl: z.url({ protocol: /^https$/ }),
  status: z.literal("review_required"),
  disclosure: z.string().min(1).max(2000),
});
export const PreparedGiftResultSchema = z.object({ gift: PreparedGiftSchema });
/** A provider-created checkout session, NOT a payment or a locked-price quote. */
export const PreparedCheckoutSchema = z.object({
  providerId: IdSchema,
  opportunityId: IdSchema,
  sessionId: z.string().min(1).max(255),
  expectedAmount: MoneySchema.describe(
    "Amount requested and revalidated before session creation, not a price lock or verified processor total. The donor must review the final checkout total.",
  ),
  checkoutUrl: z.url({ protocol: /^https$/ }),
  status: z.literal("approval_required"),
  disclosure: z.string().min(1).max(2000),
});
export const PreparedCheckoutResultSchema = z.object({
  checkout: PreparedCheckoutSchema,
});
export const CheckoutInputSchema = z.strictObject({
  providerId: IdSchema,
  quoteId: IdSchema,
  idempotencyKey: z
    .string()
    .min(16)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/),
});
export const StatusInputSchema = z.strictObject({
  providerId: IdSchema,
  contributionId: IdSchema,
});
export const QuoteSchema = z.object({
  id: IdSchema,
  providerId: IdSchema,
  opportunityId: IdSchema,
  organization: OrganizationSchema,
  amount: MoneySchema,
  fees: MoneySchema,
  total: MoneySchema,
  expiresAt: z.iso.datetime({ offset: true }),
  terms: z.string().min(1).max(2000),
  refundPolicy: z.string().min(1).max(2000),
  completionMode: z.enum(["browser_handoff", "native"]),
});
export const ContributionStatusSchema = z.object({
  id: IdSchema,
  providerId: IdSchema,
  opportunityId: IdSchema,
  quoteId: IdSchema,
  status: z.enum([
    "approval_required",
    "pending",
    "confirmed",
    "failed",
    "cancelled",
    "expired",
    "refunded",
    "disputed",
  ]),
  amount: MoneySchema,
  updatedAt: z.iso.datetime({ offset: true }),
});
export const CheckoutSessionSchema = z.object({
  contribution: ContributionStatusSchema,
  checkoutUrl: z.url({ protocol: /^https$/ }),
  expiresAt: z.iso.datetime({ offset: true }),
});
export const ErrorCodeSchema = z.enum([
  "invalid_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "provider_unavailable",
  "provider_not_verified",
  "unsupported_capability",
  "opportunity_unavailable",
  "quote_expired",
  "idempotency_conflict",
  "rate_limited",
  "internal_error",
]);
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    requestId: z.string().optional(),
  }),
});
export const SearchResultSchema = z.object({
  opportunities: z.array(PublicOpportunitySchema),
  nextCursor: z.string().optional(),
});
export const ProvidersResultSchema = z.object({
  providers: z.array(ProviderInfoSchema),
});
export const SetupGuideSchema = z.object({
  version: z.literal(1),
  preferencesSaved: z.literal(false),
  paymentAuthorized: z.literal(false),
  providers: z.array(ProviderInfoSchema),
  questions: z.array(z.object({ id: z.string(), question: z.string() })),
  nextStep: z.string(),
  limitations: z.array(z.string()),
});
export const OpportunityResultSchema = z.object({
  opportunity: PublicOpportunitySchema,
});
export const QuoteResultSchema = z.object({ quote: QuoteSchema });
export const CheckoutResultSchema = z.object({
  checkout: CheckoutSessionSchema,
});
export const StatusResultSchema = z.object({
  contribution: ContributionStatusSchema,
});

export type Money = z.infer<typeof MoneySchema>;
export type ProviderInfo = z.infer<typeof ProviderInfoSchema>;
export type VerificationState = z.infer<typeof VerificationSchema>;
export type PublicOpportunity = z.infer<typeof PublicOpportunitySchema>;
export type OpportunityQuery = z.infer<typeof OpportunityQuerySchema>;
export type SearchInput = z.infer<typeof SearchInputSchema>;
export type QuoteInput = z.infer<typeof QuoteInputSchema>;
export type PrepareCheckoutInput = z.infer<typeof PrepareCheckoutInputSchema>;
export type PreparedGift = z.infer<typeof PreparedGiftSchema>;
export type PreparedCheckout = z.infer<typeof PreparedCheckoutSchema>;
export type Quote = z.infer<typeof QuoteSchema>;
export type CheckoutSession = z.infer<typeof CheckoutSessionSchema>;
export type ContributionStatus = z.infer<typeof ContributionStatusSchema>;
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export class GivingError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GivingError";
  }
}
export function validateMoney(value: Money): void {
  MoneySchema.parse(value);
}
/** Zod selects the approved shape recursively, including nested objects. */
export function projectPublicOpportunity(
  value: PublicOpportunity,
): PublicOpportunity {
  return PublicOpportunitySchema.parse(value);
}
export function matchesQuery(
  item: PublicOpportunity,
  query: OpportunityQuery,
): boolean {
  const same = (a: string | undefined, b: string | undefined) =>
    b === undefined || a?.toLowerCase() === b.toLowerCase();
  return (
    item.status === "available" &&
    same(item.category, query.category) &&
    same(item.location?.displayName, query.location) &&
    same(item.location?.countryCode, query.countryCode) &&
    same(item.location?.region, query.region) &&
    same(item.location?.locality, query.locality) &&
    (query.maxAmount === undefined ||
      (item.amount.currency === query.maxAmount.currency &&
        query.maxAmount.minorUnits > 0 &&
        (item.fundingModel === "partial" ||
          item.amount.minorUnits <= query.maxAmount.minorUnits)))
  );
}

export const wireSchemas = {
  Money: MoneySchema,
  Provider: ProviderInfoSchema,
  Opportunity: PublicOpportunitySchema,
  SearchInput: SearchInputSchema,
  SearchResult: SearchResultSchema,
  GetOpportunityInput: GetOpportunityInputSchema,
  OpportunityResult: OpportunityResultSchema,
  ProvidersResult: ProvidersResultSchema,
  SetupGuide: SetupGuideSchema,
  QuoteInput: QuoteInputSchema,
  PrepareCheckoutInput: PrepareCheckoutInputSchema,
  PrepareGiftInput: PrepareGiftInputSchema,
  PreparedGiftResult: PreparedGiftResultSchema,
  PreparedCheckoutResult: PreparedCheckoutResultSchema,
  QuoteResult: QuoteResultSchema,
  CheckoutInput: CheckoutInputSchema,
  CheckoutResult: CheckoutResultSchema,
  StatusInput: StatusInputSchema,
  StatusResult: StatusResultSchema,
  Error: ErrorResponseSchema,
};
export function jsonSchemas(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(wireSchemas).map(([name, schema]) => [
      name,
      z.toJSONSchema(schema),
    ]),
  );
}
