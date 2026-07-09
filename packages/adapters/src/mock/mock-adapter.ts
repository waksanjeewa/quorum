import type { TurnContext, TurnResult } from "@quorum/core";
import {
  AbortError,
  abortableDelay,
  type AuthResult,
  type Capabilities,
  type ModelAdapter,
  type QuotaHint,
} from "../types.js";

/**
 * A single programmed turn. Either a TurnResult (or a function of the context that returns one),
 * or a directive that simulates real-world adapter behavior for the contract suite.
 */
export type MockStep =
  | TurnResult
  | ((ctx: TurnContext) => TurnResult)
  | { kind: "delay"; ms: number; result: TurnResult }
  | { kind: "hang" } // never resolves until aborted — for the abort contract test
  | { kind: "throw"; message: string }; // adapter itself throws — must be caught → error

export interface MockAdapterOpts {
  id?: string;
  auth?: AuthResult;
  capabilities?: Partial<Capabilities>;
  /** Consumed one per takeTurn call. When exhausted, falls back to an echo "ok" turn. */
  script?: MockStep[];
  /** When set, probeQuota is defined and returns this. */
  quota?: QuotaHint;
  /** Delay every turn by this many ms (abortable) — lets tests pace a run for external interaction. */
  delayMs?: number;
}

/**
 * Scriptable in-memory adapter (SPEC §5). Powers all core/daemon tests and is the reference
 * implementation the contract suite validates. Deterministic: no clocks, no randomness.
 */
export class MockAdapter implements ModelAdapter {
  readonly id: string;
  private readonly authResult: AuthResult;
  private readonly caps: Capabilities;
  private readonly script: MockStep[];
  private readonly quota: QuotaHint | undefined;
  private readonly delayMs: number;
  /** Number of takeTurn calls received — useful for assertions. */
  calls = 0;

  constructor(opts: MockAdapterOpts = {}) {
    this.id = opts.id ?? "mock";
    this.authResult = opts.auth ?? { ok: true, detail: "mock auth ok" };
    this.caps = {
      passThroughCommands: false,
      canExecute: false,
      contextWindow: 200_000,
      costTier: "free",
      ...opts.capabilities,
    };
    this.script = opts.script ? [...opts.script] : [];
    this.quota = opts.quota;
    this.delayMs = opts.delayMs ?? 0;
    if (this.quota !== undefined) {
      this.probeQuota = async () => this.quota as QuotaHint;
    }
  }

  async auth(): Promise<AuthResult> {
    return this.authResult;
  }

  capabilities(): Capabilities {
    return this.caps;
  }

  probeQuota?: () => Promise<QuotaHint>;

  async takeTurn(ctx: TurnContext, signal: AbortSignal): Promise<TurnResult> {
    this.calls++;
    if (signal.aborted) throw new AbortError();
    if (this.delayMs > 0) await abortableDelay(this.delayMs, signal);
    const step = this.script.shift();

    if (step === undefined) {
      return { status: "ok", content: `[${this.id}] ack: ${ctx.goal}` };
    }
    if (typeof step === "function") return step(ctx);
    if ("status" in step) return step;

    switch (step.kind) {
      case "delay":
        await abortableDelay(step.ms, signal);
        return step.result;
      case "hang":
        await new Promise<never>((_, reject) => {
          if (signal.aborted) return reject(new AbortError());
          signal.addEventListener("abort", () => reject(new AbortError()), { once: true });
        });
        throw new AbortError(); // unreachable, satisfies types
      case "throw":
        // Simulate the adapter blowing up on malformed upstream output. A real adapter must
        // catch this internally; MockAdapter models a *well-behaved* one that maps it to error.
        return { status: "error", detail: step.message, retryable: false };
    }
  }
}
