import { SetupGuideSchema, type ProviderInfo } from "@open-giving/protocol";

/** Guidance only: no donor profile, stored rule, scheduled job or consent. */
export function createSetupGuide(providers: ProviderInfo[]) {
  return SetupGuideSchema.parse({
    version: 1,
    preferencesSaved: false,
    paymentAuthorized: false,
    providers,
    questions: [
      {
        id: "place",
        question: "Which of the provider's available locations, or anywhere?",
      },
      {
        id: "causes",
        question: "Which of the provider's need types, or any cause?",
      },
      {
        id: "suggestion",
        question:
          "What fixed amount or share of savings should guide suggestions?",
      },
      {
        id: "per_gift_limit",
        question:
          "What is your per-gift limit, in an explicit supported currency?",
      },
      {
        id: "monthly_limit",
        question:
          "What is your monthly cap, including completed and unresolved gifts?",
      },
      {
        id: "cadence",
        question:
          "Only when asked, or optional reminders if your agent supports them?",
      },
    ],
    nextStep:
      "Ask only unanswered questions, summarize the rule for confirmation and ask fresh approval for each gift. Keep answers with the agent. Save a rule or schedule a reminder only through a supported platform capability with consent. Do not send setup answers to the provider.",
    limitations: [
      "Setup grants no payment authorization and creates no account or stored preferences.",
      "Provider capabilities determine currencies and funding rules; do not infer a country from a location label.",
      "A checkout link or session is not payment confirmation. Resolve uncertain attempts before trying again.",
      "Do not send purchases, bank details, email contents or the giving rule to a provider.",
    ],
  });
}
