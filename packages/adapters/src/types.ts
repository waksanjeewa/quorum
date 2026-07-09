import type { TurnContext, TurnResult } from "@quorum/core";

export interface AuthResult {
  ok: boolean;
  detail: string;
}

export interface Capabilities {
  /** Can this agent invoke user-defined slash commands/skills headlessly? (DESIGN §10, §12) */
  passThroughCommands: boolean;
  contextWindow: number;
  costTier: "subscription" | "api" | "free";
}

export interface QuotaHint {
  /** 0–100; omitted when the provider exposes no quota surface (e.g. Claude — DESIGN §12.2). */
  remainingPct?: number;
  /** ISO time the window resets, when known. */
  resetsAt?: string;
}

/**
 * One seat's model, behind a uniform interface (SPEC §5). Implementations: mock, ollama,
 * claude (SDK), codex (SDK), http (generic OpenAI-compatible). Every implementation must
 * pass the shared contract suite (contract/adapter-contract.ts).
 */
export interface ModelAdapter {
  readonly id: string;
  /** Verify the login/API key works. Must resolve (never throw) so the daemon can report cleanly. */
  auth(): Promise<AuthResult>;
  capabilities(): Capabilities;
  /**
   * Take one deliberation turn. Must honor `signal` (reject with an AbortError promptly on abort),
   * map usage/rate limits to `{status:"usage_limit"}`, and NEVER throw on malformed upstream
   * output — return `{status:"error"}` instead.
   */
  takeTurn(ctx: TurnContext, signal: AbortSignal): Promise<TurnResult>;
  /** Optional proactive quota probe (Codex has it; Claude does not). */
  probeQuota?(): Promise<QuotaHint>;
}

/** Standard abort error, so all adapters reject uniformly on cancellation. */
export class AbortError extends Error {
  override readonly name = "AbortError";
  constructor(message = "aborted") {
    super(message);
  }
}

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === "AbortError") ||
    (typeof err === "object" && err !== null && (err as { name?: string }).name === "AbortError")
  );
}

/** Reject as soon as `signal` aborts; resolves after `ms` otherwise. Used by adapters to stay cancelable. */
export function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new AbortError());
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
