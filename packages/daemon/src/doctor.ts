import type { SessionConfig } from "@quorum/core";
import { buildAdapterRegistry, type BuildRegistryOpts } from "./registry.js";

export interface SeatCheck {
  id: string;
  ok: boolean;
  detail: string;
  canExecute: boolean;
}

/**
 * Check every model configured across the seat chains: is it reachable / logged in? Powers
 * `quorum doctor` so users know which seats are ready and what to do about the ones that aren't.
 */
export async function doctorReport(config: SessionConfig, opts: BuildRegistryOpts = {}): Promise<SeatCheck[]> {
  const { registry } = buildAdapterRegistry(config, opts);
  const ids = [...new Set(Object.values(config.seats).flatMap((s) => s.chain))];
  return Promise.all(
    ids.map(async (id): Promise<SeatCheck> => {
      const adapter = registry.get(id);
      if (!adapter) return { id, ok: false, detail: "unknown model id", canExecute: false };
      const canExecute = adapter.capabilities().canExecute;
      try {
        const auth = await adapter.auth();
        return { id, ok: auth.ok, detail: auth.detail, canExecute };
      } catch (err) {
        return { id, ok: false, detail: String(err), canExecute };
      }
    }),
  );
}
