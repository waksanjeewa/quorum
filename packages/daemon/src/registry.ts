import type { SeatId, SeatRunner, SessionConfig } from "@quorum/core";
import {
  createClaudeAdapter,
  createCodexAdapter,
  OllamaAdapter,
  resolveHttpAdapter,
  type AdapterRegistry,
  type ModelAdapter,
} from "@quorum/adapters";

export interface BuildRegistryOpts {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

const TIER_RANK = { free: 0, api: 1, subscription: 2 } as const;

export interface BuiltRegistry {
  registry: AdapterRegistry;
  /** Cheapest available adapter across all seat chains — used as the summary maintainer's model. */
  summarizer(): SeatRunner | undefined;
}

/**
 * Resolve every model id that appears in the config's failover chains into a concrete adapter
 * (SPEC §7). Instances are cached by id. Recognizes: `claude`, `codex`, `ollama/<model>`, and any
 * `<provider>/<model>` handled by the generic HTTP adapter (OpenRouter, OmniRoute, direct APIs).
 */
export function buildAdapterRegistry(config: SessionConfig, opts: BuildRegistryOpts = {}): BuiltRegistry {
  // NOT cached: each get() returns a FRESH adapter, so two seats using the same model id (e.g. one
  // model staffing all three roles) get independent SDK conversation threads instead of sharing one.
  const get = (id: string): ModelAdapter | undefined => {
    if (id === "claude") return createClaudeAdapter();
    if (id === "codex") return createCodexAdapter();
    if (id.startsWith("ollama/")) {
      return new OllamaAdapter({ model: id.slice("ollama/".length), ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}) });
    }
    return resolveHttpAdapter(id, {
      providers: config.providers,
      ...(opts.env ? { env: opts.env } : {}),
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    });
  };

  const summarizer = (): SeatRunner | undefined => {
    const ids = new Set(Object.values(config.seats).flatMap((s) => s.chain));
    let best: ModelAdapter | undefined;
    for (const id of ids) {
      const a = get(id);
      if (!a) continue;
      if (!best || TIER_RANK[a.capabilities().costTier] < TIER_RANK[best.capabilities().costTier]) best = a;
    }
    return best;
  };

  return { registry: { get }, summarizer };
}

/**
 * Build the Phase-2 executor factory: an execute-mode adapter per worktree, drawn from the
 * executor-capable models (claude, codex) across all seat chains. `attempt` walks that ordered list
 * for worktree-bound failover; null when exhausted.
 */
export function buildExecutorFactory(config: SessionConfig): (worktreePath: string, attempt: number) => SeatRunner | null {
  const ids = [...new Set(Object.values(config.seats).flatMap((s) => s.chain))].filter((id) => id === "claude" || id === "codex");
  return (worktreePath, attempt) => {
    const id = ids[attempt];
    if (id === "claude") return createClaudeAdapter({ execute: { workingDirectory: worktreePath } });
    if (id === "codex") return createCodexAdapter({ execute: { workingDirectory: worktreePath } });
    return null;
  };
}

/** Names of the executor-capable models configured across all seats (for `quorum doctor` / gating). */
export function executorModelIds(config: SessionConfig): string[] {
  const seatIds: SeatId[] = Object.keys(config.seats);
  void seatIds;
  return [...new Set(Object.values(config.seats).flatMap((s) => s.chain))].filter((id) => id === "claude" || id === "codex");
}
