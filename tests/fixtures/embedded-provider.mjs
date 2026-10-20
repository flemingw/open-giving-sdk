import assert from "node:assert/strict";
import { createPantryAdapter } from "@open-giving/example-embedded-provider";

export const opportunityId = "shared-local-id";
export const input = {
  providerId: "example-pantry",
  opportunityId,
  amount: { currency: "EUR", minorUnits: 2500 },
};
export function fixture({ checkout = false } = {}) {
  const target = {
    key: opportunityId,
    approvedTitle: "Fictional food basket",
    approvedSummary:
      "Synthetic, approved description. No real household is represented.",
    available: true,
    approvedForAgents: true,
    costMinorUnits: 2500,
    privateCaseNotes: "PRIVATE case notes must never be exposed",
  };
  const calls = [];
  const services = {
    async listTargets() {
      return [target];
    },
    async getTarget(key) {
      return key === target.key ? target : null;
    },
    ...(checkout
      ? {
          async createSession(value) {
            // Model existing provider-side validation, not an SDK payment backend.
            calls.push(structuredClone(value));
            assert.equal(value.targetKey, target.key);
            assert.ok(target.available && target.approvedForAgents);
            assert.deepEqual(value.expectedAmount, {
              currency: "EUR",
              minorUnits: target.costMinorUnits,
            });
            assert.ok(value.context.principalId);
            return {
              id: "fictional-session",
              checkoutUrl: "https://checkout.example.invalid/review",
            };
          },
        }
      : {}),
  };
  return { target, calls, services, adapter: createPantryAdapter(services) };
}
