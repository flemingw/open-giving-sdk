import { z } from "zod";
import {
  GivingError,
  SearchInputSchema,
  GetOpportunityInputSchema,
  QuoteInputSchema,
  PrepareCheckoutInputSchema,
  PrepareGiftInputSchema,
  PreparedGiftResultSchema,
  PreparedCheckoutResultSchema,
  CheckoutInputSchema,
  StatusInputSchema,
  ProvidersResultSchema,
  SetupGuideSchema,
  SearchResultSchema,
  OpportunityResultSchema,
  QuoteResultSchema,
  CheckoutResultSchema,
  StatusResultSchema,
} from "@open-giving/protocol";
import type { GivingService, Principal, Scope } from "./service.js";
import { createSetupGuide } from "./onboarding.js";

export interface GivingTool {
  name: string;
  description: string;
  inputSchema: z.ZodObject;
  outputSchema: z.ZodObject;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  call(input: unknown): Promise<{
    content: Array<{ type: "text"; text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  }>;
}

/** Reuse the protocol in an adopter's existing MCP server, without a second host
 * or a dependency on that server's MCP SDK version. Identity comes from the host. */
export function createGivingTools(
  service: GivingService,
  principal: Principal,
  requestId: string,
): GivingTool[] {
  const result: GivingTool[] = [];
  function tool(
    name: string,
    description: string,
    inputSchema: z.ZodObject,
    outputSchema: z.ZodObject,
    scope: Scope,
    run: (input: unknown) => Promise<unknown>,
    readOnly = true,
  ) {
    if (!principal.scopes.includes(scope)) return;
    result.push({
      name,
      description,
      inputSchema,
      outputSchema,
      annotations: {
        readOnlyHint: readOnly,
        destructiveHint: false,
        idempotentHint: readOnly || name === "create_checkout_session",
        openWorldHint: true,
      },
      async call(input) {
        try {
          const parsed = inputSchema.safeParse(input);
          if (!parsed.success)
            throw new GivingError(
              "invalid_request",
              "Arguments do not match the documented schema",
            );
          const output = outputSchema.parse(await run(parsed.data)) as Record<
            string,
            unknown
          >;
          return {
            content: [{ type: "text", text: JSON.stringify(output) }],
            structuredContent: output,
          };
        } catch (error) {
          const safe =
            error instanceof GivingError
              ? error
              : new GivingError(
                  "provider_unavailable",
                  "The provider could not complete the request",
                );
          const output = {
            error: { code: safe.code, message: safe.message, requestId },
          };
          return {
            isError: true,
            content: [{ type: "text", text: JSON.stringify(output) }],
          };
        }
      },
    });
  }
  tool(
    "get_started",
    "Return provider capabilities and giving-rule setup guidance. Accepts no donor data and saves no preferences or authorization.",
    z.strictObject({}),
    SetupGuideSchema,
    "opportunities:read",
    async () =>
      createSetupGuide((await service.listProviders(principal)).providers),
  );
  tool(
    "list_providers",
    "List enabled nonprofit providers and their verification states and capabilities.",
    z.strictObject({}),
    ProvidersResultSchema,
    "opportunities:read",
    () => service.listProviders(principal),
  );
  tool(
    "search_opportunities",
    "Find current approved opportunities by provider, cause, coarse location, and budget in a specified currency.",
    SearchInputSchema,
    SearchResultSchema,
    "opportunities:read",
    (input) => service.search(input, principal),
  );
  tool(
    "get_opportunity",
    "Get one currently available, approved public opportunity.",
    GetOpportunityInputSchema,
    OpportunityResultSchema,
    "opportunities:read",
    (input) => service.get(input, principal),
  );
  tool(
    "search_needs",
    "Alias of search_opportunities: find approved needs by provider, cause, coarse location and maximum amount in an explicit currency.",
    SearchInputSchema,
    SearchResultSchema,
    "opportunities:read",
    (input) => service.search(input, principal),
  );
  tool(
    "quote_contribution",
    "Create an expiring quote with exact amount, fees, recipient, terms, and supported completion mode. Does not authorize or charge a payment.",
    QuoteInputSchema,
    QuoteResultSchema,
    "quotes:write",
    (input) => service.quote(input, principal, requestId),
    false,
  );
  tool(
    "prepare_gift",
    "Return a provider review link for an exact gift. Does not reserve a need, create a payment session, authorize payment or confirm a donation. Keep the donor's rule and monthly cap in the agent; get fresh approval before payment.",
    PrepareGiftInputSchema,
    PreparedGiftResultSchema,
    "opportunities:read",
    (input) => service.prepareGift(input, principal),
  );
  tool(
    "prepare_checkout",
    "After explicit donor approval, ask the provider to create a checkout session for this gift. State-changing; not assumed idempotent. Never retry an ambiguous result. Review the final total and approve payment with the provider/platform. A session is not a paid gift or a price lock.",
    PrepareCheckoutInputSchema,
    PreparedCheckoutResultSchema,
    "checkout:write",
    (input) => service.prepareCheckout(input, principal, requestId),
    false,
  );
  tool(
    "create_checkout_session",
    "Create a provider-hosted review session for an exact quote. The user must approve and complete payment with the provider. This handoff is not a confirmed donation or native agent payment.",
    CheckoutInputSchema,
    CheckoutResultSchema,
    "checkout:write",
    (input) => service.checkout(input, principal, requestId),
    false,
  );
  tool(
    "get_contribution_status",
    "Check the authenticated caller's contribution status. Only provider-confirmed status proves payment.",
    StatusInputSchema,
    StatusResultSchema,
    "contributions:read",
    (input) => service.status(input, principal, requestId),
  );

  return result;
}

/** JSON definitions for existing low-level MCP servers. Keep call() private. */
export function givingToolDefinition(tool: GivingTool) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: {
      ...z.toJSONSchema(tool.inputSchema),
      type: "object" as const,
    },
    outputSchema: {
      ...z.toJSONSchema(tool.outputSchema),
      type: "object" as const,
    },
    annotations: tool.annotations,
  };
}
