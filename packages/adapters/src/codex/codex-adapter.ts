import type { AuthResult, QuotaHint } from "../types.js";
import { SdkAdapter, type ChatClient } from "../sdk/chat-client.js";

export interface CodexAdapterOpts {
  model?: string;
  /** Injected ChatClient (tests). If omitted, a lazy Codex SDK client is used. */
  client?: ChatClient;
  authCheck?: () => Promise<AuthResult>;
  /** Override the quota probe (tests). If omitted, uses the app-server rate-limit read. */
  probeQuota?: () => Promise<QuotaHint>;
}

/**
 * Codex adapter over @openai/codex-sdk (DESIGN §12.1). Reuses the user's ChatGPT login (~/.codex).
 * Unlike Claude it exposes a quota surface (app-server account/rateLimits/read), so probeQuota is
 * implemented → the seat manager can hand off PROACTIVELY before hitting the wall.
 */
export function createCodexAdapter(opts: CodexAdapterOpts = {}): SdkAdapter {
  return new SdkAdapter({
    id: "codex",
    client: opts.client ?? createCodexSdkClient(opts.model),
    capabilities: { passThroughCommands: false, contextWindow: 272_000, costTier: "subscription" },
    limitRegex: /hit your usage limit|usage limit|rate limit/i,
    authCheck: opts.authCheck ?? defaultCodexAuth,
    probeQuota: opts.probeQuota ?? probeCodexQuota,
  });
}

async function defaultCodexAuth(): Promise<AuthResult> {
  try {
    await loadCodexSdk();
  } catch {
    return { ok: false, detail: "Install @openai/codex-sdk and run `codex login` to use the codex seat" };
  }
  const source = process.env.CODEX_API_KEY ? "CODEX_API_KEY" : "ChatGPT login (~/.codex)";
  return { ok: true, detail: `Codex SDK available (auth: ${source})` };
}

async function loadCodexSdk(): Promise<{ Codex: new () => unknown }> {
  const mod = "@openai/codex-sdk";
  return (await import(mod)) as { Codex: new () => unknown };
}

/**
 * Best-effort quota probe via the Codex app-server (account/rateLimits/read → session + weekly
 * buckets). Returns {} when unavailable so the seat manager simply won't proactively hand off.
 */
async function probeCodexQuota(): Promise<QuotaHint> {
  try {
    const mod = "@openai/codex-sdk";
    const sdk = (await import(mod)) as {
      Codex: new () => { rateLimits?: () => Promise<{ primary?: { remainingPercent?: number; resetsAt?: string } }> };
    };
    const codex = new sdk.Codex();
    const limits = await codex.rateLimits?.();
    const primary = limits?.primary;
    if (!primary) return {};
    return {
      ...(primary.remainingPercent !== undefined ? { remainingPct: primary.remainingPercent } : {}),
      ...(primary.resetsAt ? { resetsAt: primary.resetsAt } : {}),
    };
  } catch {
    return {};
  }
}

/** Lazy bridge from the Codex SDK thread API to our ChatClient port. */
function createCodexSdkClient(model?: string): ChatClient {
  return {
    async run({ system, user, sessionId }) {
      const { Codex } = await loadCodexSdk();
      const codex = new Codex() as {
        startThread: (o?: unknown) => { id?: string; run: (p: string) => Promise<{ finalResponse?: string; text?: string }> };
        resumeThread: (id: string, o?: unknown) => { id?: string; run: (p: string) => Promise<{ finalResponse?: string; text?: string }> };
      };
      // Deliberation never touches files: read-only sandbox, and skip the git-repo check so Quorum
      // sessions can run in ANY directory (verified in the live smoke test — the SDK otherwise
      // errors "Not inside a trusted directory" outside a git repo).
      const opts: Record<string, unknown> = { skipGitRepoCheck: true, sandboxMode: "read-only" };
      if (model) opts["model"] = model;
      const thread = sessionId ? codex.resumeThread(sessionId, opts) : codex.startThread(opts);
      const result = (await thread.run(`${system}\n\n${user}`)) as {
        finalResponse?: string;
        text?: string;
        usage?: { input_tokens?: number; output_tokens?: number; reasoning_output_tokens?: number };
      };
      const text = result.finalResponse ?? result.text ?? "";
      // Subscription seat: report tokens but no costUsd (maxCostUsd tracks API seats only, DESIGN §7).
      const u = result.usage;
      const usage =
        u && (u.input_tokens !== undefined || u.output_tokens !== undefined)
          ? {
              ...(u.input_tokens !== undefined ? { inputTokens: u.input_tokens } : {}),
              ...(u.output_tokens !== undefined ? { outputTokens: (u.output_tokens ?? 0) + (u.reasoning_output_tokens ?? 0) } : {}),
            }
          : undefined;
      return { text, ...(usage ? { usage } : {}), ...(thread.id ? { sessionId: thread.id } : sessionId ? { sessionId } : {}) };
    },
  };
}
