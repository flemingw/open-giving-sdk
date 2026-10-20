import { GivingError, ProviderInfoSchema } from "@open-giving/protocol";
import type { ProviderInfo } from "@open-giving/protocol";
import type { ContributionProviderAdapter } from "@open-giving/provider-sdk";

export interface ProviderRegistration {
  id: string;
  adapter: ContributionProviderAdapter;
  /** Operator-controlled trust, never inferred from an adapter response. */
  verification: "verified" | "sandbox" | "suspended";
  /** Optional host-owned enablement policy, evaluated per operation. */
  isEnabled?: () => boolean;
}
export class ProviderRegistry {
  private entries = new Map<string, ProviderRegistration>();
  constructor(
    entries: ProviderRegistration[],
    private allowSandbox = false,
  ) {
    for (const entry of entries) {
      if (this.entries.has(entry.id))
        throw new Error("Duplicate provider registration");
      this.entries.set(entry.id, { ...entry });
    }
  }
  get(id: string): ContributionProviderAdapter {
    const entry = this.entries.get(id);
    if (!entry) throw new GivingError("not_found", "Provider was not found");
    if (entry.isEnabled && !entry.isEnabled()) {
      throw new GivingError(
        "provider_not_verified",
        "Provider is not enabled by host policy",
      );
    }
    if (
      entry.verification !== "verified" &&
      !(entry.verification === "sandbox" && this.allowSandbox)
    ) {
      throw new GivingError(
        "provider_not_verified",
        "Provider is not enabled for this environment",
      );
    }
    return entry.adapter;
  }
  async info(id: string): Promise<ProviderInfo> {
    const adapter = this.get(id);
    const info = ProviderInfoSchema.parse(await adapter.getProvider());
    if (info.id !== id)
      throw new GivingError(
        "provider_unavailable",
        "Provider returned an invalid identity",
      );
    return { ...info, verification: this.entries.get(id)!.verification };
  }
  async list(): Promise<ProviderInfo[]> {
    const result: ProviderInfo[] = [];
    for (const [id, entry] of this.entries) {
      if (
        (entry.verification === "verified" ||
          (entry.verification === "sandbox" && this.allowSandbox)) &&
        (!entry.isEnabled || entry.isEnabled())
      ) {
        result.push(await this.info(id));
      }
    }
    return result.sort((a, b) => a.id.localeCompare(b.id));
  }
  setVerification(
    id: string,
    verification: ProviderRegistration["verification"],
  ): void {
    const entry = this.entries.get(id);
    if (!entry) throw new GivingError("not_found", "Provider was not found");
    this.entries.set(id, { ...entry, verification });
  }
}
