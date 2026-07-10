import { reviewDiff, type ReviewInput, type SeatRunner, type SessionConfig } from "@quorum/core";
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

/** Is this chain id an executor-capable model (claude/codex, with or without a /model suffix)? */
export function isExecutorModel(id: string): boolean {
  return /^(claude|codex)(\/|$)/.test(id);
}

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
    if (id.startsWith("claude/")) return createClaudeAdapter({ model: id.slice("claude/".length) });
    if (id === "codex") return createCodexAdapter();
    if (id.startsWith("codex/")) return createCodexAdapter({ model: id.slice("codex/".length) });
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
  const ids = [...new Set(Object.values(config.seats).flatMap((s) => s.chain))].filter(isExecutorModel);
  return (worktreePath, attempt) => {
    const id = ids[attempt];
    if (!id) return null;
    const execute = { workingDirectory: worktreePath };
    if (id === "claude") return createClaudeAdapter({ execute });
    if (id.startsWith("claude/")) return createClaudeAdapter({ model: id.slice("claude/".length), execute });
    if (id === "codex") return createCodexAdapter({ execute });
    if (id.startsWith("codex/")) return createCodexAdapter({ model: id.slice("codex/".length), execute });
    return null;
  };
}

/**
 * A single runner for triaging shell input (chat vs. build) before a roundtable is convened.
 * Prefers an executor-capable model (claude/codex) for a good conversational reply, else the first
 * configured model.
 */
export function buildTriageRunner(config: SessionConfig, opts: BuildRegistryOpts = {}): SeatRunner | undefined {
  const { registry } = buildAdapterRegistry(config, opts);
  const ids = [...new Set(Object.values(config.seats).flatMap((s) => s.chain))];
  const preferred = ids.find(isExecutorModel) ?? ids[0];
  return preferred ? registry.get(preferred) : undefined;
}

/**
 * A review function that has a capable model judge each executor diff before merge (the subjective
 * gate). Prefers the critic seat's first model — in frugal mode that's the PAID verifier, so paid
 * quota is spent on judgement. Returns undefined if no model can be built (falls back to acceptance-only).
 */
export function buildReviewFn(
  config: SessionConfig,
  opts: BuildRegistryOpts = {},
): ((input: ReviewInput) => Promise<{ approved: boolean; reason?: string }>) | undefined {
  const { registry } = buildAdapterRegistry(config, opts);
  const criticChain = config.seats["critic"]?.chain ?? [];
  const anyChain = Object.values(config.seats).flatMap((s) => s.chain);
  const reviewerId = criticChain.find(isExecutorModel) ?? criticChain[0] ?? anyChain.find(isExecutorModel) ?? anyChain[0];
  const runner = reviewerId ? registry.get(reviewerId) : undefined;
  if (!runner) return undefined;
  return (input) => reviewDiff(runner, input);
}

/** Names of the executor-capable models configured across all seats (for `quorum doctor` / gating). */
export function executorModelIds(config: SessionConfig): string[] {
  return [...new Set(Object.values(config.seats).flatMap((s) => s.chain))].filter(isExecutorModel);
}
