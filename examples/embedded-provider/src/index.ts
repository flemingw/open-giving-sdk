import { matchesQuery } from "@open-giving/protocol";
import type {
  Money,
  PublicOpportunity,
  QuoteInput,
} from "@open-giving/protocol";
import type {
  ContributionProviderAdapter,
  ProviderContext,
} from "@open-giving/provider-sdk";

/** Fictional application's existing data model, NOT an SDK persistence schema. */
export interface PantryTarget {
  key: string;
  approvedTitle: string;
  approvedSummary: string;
  available: boolean;
  approvedForAgents: boolean;
  costMinorUnits: number;
  privateCaseNotes?: string;
}

/** Implement these functions in the adopting nonprofit's own repository.
 * No HTTP client, processor SDK, database or credentials are bundled here. */
export interface PantryServices {
  listTargets(): Promise<PantryTarget[]>;
  getTarget(key: string): Promise<PantryTarget | null>;
  /** The existing backend must validate current terms and caller authority
   * atomically before creating a session. This callback does not charge. */
  createSession?(input: {
    targetKey: string;
    expectedAmount: Money;
    context: ProviderContext;
  }): Promise<{ id: string; checkoutUrl: string }>;
}

/** Example nonprofit-side wiring. Not a reusable provider client or live integration. */
export function createPantryAdapter(
  services: PantryServices,
): ContributionProviderAdapter {
  const providerId = "example-pantry";
  const createSession = services.createSession?.bind(services);
  const project = (target: PantryTarget): PublicOpportunity | null =>
    !target.available || !target.approvedForAgents
      ? null
      : {
          providerId,
          id: target.key,
          organization: {
            id: "example-pantry-org",
            displayName: "Fictional Pantry",
          },
          title: target.approvedTitle,
          summary: target.approvedSummary,
          category: "food",
          amount: { currency: "EUR", minorUnits: target.costMinorUnits },
          fundingModel: "exact",
          status: "available",
          disclosure: "Fictional example only. No payment is accepted.",
          location: { countryCode: "IE", locality: "Dublin" },
        };
  const adapter: ContributionProviderAdapter = {
    async getProvider() {
      return {
        id: providerId,
        displayName: "Fictional Pantry",
        verification: "sandbox",
        capabilities: {
          currencies: ["EUR"],
          fundingModels: ["exact"],
          completionModes: [],
          ...(createSession ? { checkoutPreparation: true } : {}),
        },
      };
    },
    async searchOpportunities(query = {}) {
      return (await services.listTargets()).flatMap((target) => {
        const item = project(target);
        return item && matchesQuery(item, query) ? [item] : [];
      });
    },
    async getOpportunity(id) {
      const target = await services.getTarget(id);
      return target ? project(target) : null;
    },
  };
  if (createSession)
    adapter.prepareCheckout = async (input: QuoteInput, context) => {
      // No fetch back to the nonprofit, fake quote store, retries or card handling.
      const session = await createSession({
        targetKey: input.opportunityId,
        expectedAmount: { ...input.amount },
        context,
      });
      return {
        providerId,
        opportunityId: input.opportunityId,
        sessionId: session.id,
        checkoutUrl: session.checkoutUrl,
        expectedAmount: { ...input.amount },
        status: "approval_required",
        disclosure:
          "Fictional session only. No payment was made or authorized.",
      };
    };
  return adapter;
}
