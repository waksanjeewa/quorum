import type { SeatId, SeatRunner, SessionConfig, TurnContext, TurnResult } from "@quorum/core";
import type { ModelAdapter } from "./types.js";

/** Resolves a model id (as it appears in a failover chain) to a concrete adapter. */
export interface AdapterRegistry {
  get(id: string): ModelAdapter | undefined;
}

export interface SeatManagerOpts {
  /** Hand off proactively when a probed quota drops below this percent. Default 10. */
  proactiveThresholdPct?: number;
  /** Injected clock (cooldown math + tests). */
  now?: () => Date;
}

/**
 * Wraps an adapter so a low probed quota trips the SAME failover path as a real limit:
 * before each turn it probes; if remaining is below threshold it returns `usage_limit`
 * (a proactive handoff at the turn boundary, DESIGN §12) instead of calling the model.
 */
class QuotaAwareRunner implements SeatRunner {
  constructor(
    private readonly adapter: ModelAdapter,
    private readonly thresholdPct: number,
  ) {}
  get id(): string {
    return this.adapter.id;
  }
  async takeTurn(ctx: TurnContext, signal: AbortSignal): Promise<TurnResult> {
    if (this.adapter.probeQuota) {
      const q = await this.adapter.probeQuota();
      if (q.remainingPct !== undefined && q.remainingPct < this.thresholdPct) {
        return {
          status: "usage_limit",
          detail: `proactive handoff: ${q.remainingPct}% quota left (< ${this.thresholdPct}%)`,
          ...(q.resetsAt ? { resetsAt: q.resetsAt } : {}),
        };
      }
    }
    return this.adapter.takeTurn(ctx, signal);
  }
}

/**
 * Turns each seat's config failover chain into a live runner + the `failover` hook the engine
 * calls (SPEC §6 / task 060). Walks the chain on limit/error, skips models in cooldown, and
 * returns null when the chain is exhausted (the engine then pauses that seat).
 */
export class SeatManager {
  private readonly threshold: number;
  private readonly now: () => Date;
  /** Per-seat cursor into its chain. */
  private readonly cursor = new Map<SeatId, number>();
  /** adapter id → ISO time it becomes usable again (set from usage_limit resetsAt). */
  private readonly cooldown = new Map<string, string>();

  constructor(
    private readonly config: SessionConfig,
    private readonly registry: AdapterRegistry,
    opts: SeatManagerOpts = {},
  ) {
    this.threshold = opts.proactiveThresholdPct ?? 10;
    this.now = opts.now ?? (() => new Date());
    for (const seatId of Object.keys(config.seats)) this.cursor.set(seatId, 0);
  }

  /** Chain ids for a seat. */
  private chain(seatId: SeatId): string[] {
    return this.config.seats[seatId]?.chain ?? [];
  }

  private isCoolingDown(id: string): boolean {
    const until = this.cooldown.get(id);
    if (until === undefined) return false;
    if (this.now().toISOString() >= until) {
      this.cooldown.delete(id);
      return false;
    }
    return true;
  }

  /** Resolve the runner at/after `fromIdx` in the seat's chain, skipping unavailable/cooling models. */
  private resolveFrom(seatId: SeatId, fromIdx: number): SeatRunner | null {
    const chain = this.chain(seatId);
    for (let i = fromIdx; i < chain.length; i++) {
      const id = chain[i]!;
      const adapter = this.registry.get(id);
      if (!adapter || this.isCoolingDown(id)) continue;
      this.cursor.set(seatId, i);
      return new QuotaAwareRunner(adapter, this.threshold);
    }
    return null;
  }

  /** Initial runner map for runRoundtable (first available model per seat). */
  seats(): Record<SeatId, SeatRunner> {
    const out: Record<SeatId, SeatRunner> = {};
    for (const seatId of Object.keys(this.config.seats)) {
      const runner = this.resolveFrom(seatId, 0);
      if (runner) out[seatId] = runner;
    }
    return out;
  }

  /** The engine's failover hook: advance past the current model to the next available one. */
  failover = async (seatId: SeatId, result: TurnResult): Promise<SeatRunner | null> => {
    if (result.status === "usage_limit" && result.resetsAt) {
      const chain = this.chain(seatId);
      const cur = this.cursor.get(seatId) ?? 0;
      const id = chain[cur];
      if (id) this.cooldown.set(id, result.resetsAt);
    }
    const next = (this.cursor.get(seatId) ?? 0) + 1;
    return this.resolveFrom(seatId, next);
  };

  /** Reset a seat to the top of its chain (used by the `/seat` command / cooldown expiry). */
  resetSeat(seatId: SeatId): SeatRunner | null {
    return this.resolveFrom(seatId, 0);
  }
}
