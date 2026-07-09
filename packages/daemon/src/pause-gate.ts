import type { SeatRunner, TurnContext, TurnResult } from "@quorum/core";

/**
 * A resumable barrier that lets the daemon pause deliberation between turns without teaching the
 * engine about pausing. Seat runners are wrapped so each turn waits here first (SPEC §7 pause).
 */
export class PauseGate {
  private paused = false;
  private waiters: Array<() => void> = [];

  isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    const pending = this.waiters;
    this.waiters = [];
    for (const w of pending) w();
  }

  /** Resolves immediately if not paused; otherwise when resumed. Rejects (AbortError) if aborted. */
  waitUntilResumed(signal: AbortSignal): Promise<void> {
    if (!this.paused) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(abortError());
      const release = (): void => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = (): void => {
        this.waiters = this.waiters.filter((w) => w !== release);
        reject(abortError());
      };
      this.waiters.push(release);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}

function abortError(): Error {
  const e = new Error("aborted");
  e.name = "AbortError";
  return e;
}

/** Wrap a runner so it waits on the gate before each turn. */
export function gatedRunner(runner: SeatRunner, gate: PauseGate): SeatRunner {
  return {
    id: runner.id,
    async takeTurn(ctx: TurnContext, signal: AbortSignal): Promise<TurnResult> {
      await gate.waitUntilResumed(signal);
      return runner.takeTurn(ctx, signal);
    },
  };
}
