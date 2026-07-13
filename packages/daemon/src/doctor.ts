import type { SessionConfig, TurnContext } from "@quorum/core";
import { buildAdapterRegistry, isExecutorModel, type BuildRegistryOpts } from "./registry.js";

export interface SeatCheck {
  id: string;
  ok: boolean;
  detail: string;
  canExecute: boolean;
}

export interface TurnCheck {
  id: string;
  ok: boolean;
  detail: string;
}

const PING_CTX: TurnContext = {
  seat: "doctor",
  role: "arbiter",
  stage: "brainstorm",
  turnInStage: 1,
  goal: "Reply with exactly: OK",
  summary: "",
  recentTurns: [],
  pendingInjections: [],
  roleInstructions: "Reply with exactly the word OK.",
};

/**
 * Deeper check than {@link doctorReport}: run one tiny real turn per id so a model that *authenticates*
 * but then rejects the request (e.g. Codex's account-default model needs a newer CLI than is installed)
 * is caught before a goal runs. Costs one small model call per id — used by `quorum doctor`, never on
 * the settings hot path. `executorsOnly` limits it to claude/codex (the usual risk + cost sweet spot).
 */
export async function liveTurnCheck(
  config: SessionConfig,
  opts: BuildRegistryOpts & { ids?: string[]; executorsOnly?: boolean; timeoutMs?: number } = {},
): Promise<TurnCheck[]> {
  const { registry } = buildAdapterRegistry(config, opts);
  const all = opts.ids ?? [...new Set(Object.values(config.seats).flatMap((s) => s.chain))];
  const ids = opts.executorsOnly === false ? all : all.filter(isExecutorModel);
  const timeoutMs = opts.timeoutMs ?? 45_000;
  return Promise.all(
    ids.map(async (id): Promise<TurnCheck> => {
      const adapter = registry.get(id);
      if (!adapter) return { id, ok: false, detail: "unknown model id" };
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const r = await adapter.takeTurn(PING_CTX, ac.signal);
        if (r.status === "ok") return { id, ok: true, detail: "test turn ran ✓" };
        const detail = "detail" in r && r.detail ? r.detail : r.status;
        return { id, ok: false, detail: detail.replace(/\s+/g, " ").slice(0, 200) };
      } catch (err) {
        return { id, ok: false, detail: String(err instanceof Error ? err.message : err).slice(0, 200) };
      } finally {
        clearTimeout(timer);
      }
    }),
  );
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
