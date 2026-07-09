import type { TurnContext, TurnResult, Usage } from "@quorum/core";
import { AbortError, isAbortError, type AuthResult, type Capabilities, type ModelAdapter, type QuotaHint } from "../types.js";
import { renderContext } from "../shared/render.js";

/**
 * Narrow port over an agent SDK (Claude Agent SDK / Codex SDK). Both adapters drive their SDK
 * through this so the engine-facing behavior (session resume, limit detection, abort) is shared and
 * testable with a stub — no SDK install or network needed in CI.
 */
export interface ChatClient {
  /** Run one turn. `sessionId` resumes a prior thread; the returned id is passed to the next turn. */
  run(input: {
    system: string;
    user: string;
    sessionId: string | undefined;
    signal: AbortSignal;
  }): Promise<{ text: string; sessionId?: string; usage?: Usage }>;
}

export interface SdkAdapterOpts {
  id: string;
  client: ChatClient;
  capabilities: Capabilities;
  /** Matches provider limit messages, e.g. /limit reached|usage limit/i. */
  limitRegex: RegExp;
  authCheck: () => Promise<AuthResult>;
  probeQuota?: () => Promise<QuotaHint>;
}

/** Extract an ISO reset time from a limit message like "resets 3:00 PM" — best-effort. */
function parseResetsAt(message: string): string | undefined {
  const iso = /\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))\b/.exec(message);
  return iso ? iso[1] : undefined;
}

/**
 * Generic agent-SDK adapter (tasks 110/120). Persists the SDK session id ACROSS turns in memory so
 * each seat resumes its own thread within a run. (Cross-process resume to disk is a future
 * enhancement — the transcript remains the source of truth for context.)
 */
export class SdkAdapter implements ModelAdapter {
  readonly id: string;
  private readonly client: ChatClient;
  private readonly caps: Capabilities;
  private readonly limitRegex: RegExp;
  private readonly authCheck: () => Promise<AuthResult>;
  private sessionId: string | undefined;

  constructor(opts: SdkAdapterOpts) {
    this.id = opts.id;
    this.client = opts.client;
    this.caps = opts.capabilities;
    this.limitRegex = opts.limitRegex;
    this.authCheck = opts.authCheck;
    if (opts.probeQuota) this.probeQuota = opts.probeQuota;
  }

  capabilities(): Capabilities {
    return this.caps;
  }

  async auth(): Promise<AuthResult> {
    try {
      return await this.authCheck();
    } catch (err) {
      return { ok: false, detail: `auth check failed: ${String(err)}` };
    }
  }

  probeQuota?: () => Promise<QuotaHint>;

  async takeTurn(ctx: TurnContext, signal: AbortSignal): Promise<TurnResult> {
    const { system, user } = renderContext(ctx);
    try {
      const out = await this.client.run({ system, user, sessionId: this.sessionId, signal });
      if (out.sessionId) this.sessionId = out.sessionId;
      return { status: "ok", content: out.text, ...(out.usage ? { usage: out.usage } : {}) };
    } catch (err) {
      if (isAbortError(err) || signal.aborted) throw new AbortError();
      const message = err instanceof Error ? err.message : String(err);
      if (this.limitRegex.test(message)) {
        const resetsAt = parseResetsAt(message);
        return { status: "usage_limit", detail: message, ...(resetsAt ? { resetsAt } : {}) };
      }
      return { status: "error", detail: message, retryable: true };
    }
  }
}
