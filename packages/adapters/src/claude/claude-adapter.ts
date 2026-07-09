import type { AuthResult, ExecuteConfig } from "../types.js";
import { SdkAdapter, type ChatClient } from "../sdk/chat-client.js";

export interface ClaudeAdapterOpts {
  /** Model id; default lets the SDK pick the account default. */
  model?: string;
  /** Injected ChatClient (tests). If omitted, a lazy Claude Agent SDK client is used. */
  client?: ChatClient;
  /** Override the auth check (tests). */
  authCheck?: () => Promise<AuthResult>;
  /** Enable execute mode (Phase 2): tools on, edits allowed, cwd = the task's worktree. */
  execute?: ExecuteConfig;
}

/** Options passed to the SDK's query(), split out as a pure function so it can be unit-tested. */
export function claudeQueryOptions(
  system: string,
  sessionId: string | undefined,
  model: string | undefined,
  execute: ExecuteConfig | undefined,
): Record<string, unknown> {
  return {
    customSystemPrompt: system,
    ...(sessionId ? { resume: sessionId } : {}),
    ...(model ? { model } : {}),
    ...(execute
      ? { allowedTools: ["Read", "Write", "Edit", "Bash"], cwd: execute.workingDirectory, permissionMode: "acceptEdits" }
      : { allowedTools: [] }), // deliberation: no tools
  };
}

/**
 * Claude adapter over @anthropic-ai/claude-agent-sdk (DESIGN §12.2). Reuses the user's Claude
 * Code subscription login (no API key needed). Deliberation runs with tools disabled; pass
 * `execute` for Phase-2 executor mode (tools on, cwd = worktree).
 */
export function createClaudeAdapter(opts: ClaudeAdapterOpts = {}): SdkAdapter {
  return new SdkAdapter({
    id: opts.model ? `claude/${opts.model}` : "claude",
    client: opts.client ?? createClaudeSdkClient(opts.model, opts.execute),
    capabilities: { passThroughCommands: true, canExecute: true, contextWindow: 200_000, costTier: "subscription" },
    limitRegex: /limit reached|usage limit/i,
    authCheck: opts.authCheck ?? defaultClaudeAuth,
  });
}

async function defaultClaudeAuth(): Promise<AuthResult> {
  try {
    await loadClaudeSdk();
  } catch {
    return { ok: false, detail: "Install @anthropic-ai/claude-agent-sdk and run `claude login` to use the claude seat" };
  }
  const source = process.env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY" : "Claude subscription login";
  return { ok: true, detail: `Claude Agent SDK available (auth: ${source})` };
}

// Non-literal specifier keeps tsc from resolving the optional dependency at build time.
async function loadClaudeSdk(): Promise<{ query: (opts: unknown) => AsyncIterable<Record<string, unknown>> }> {
  const mod = "@anthropic-ai/claude-agent-sdk";
  return (await import(mod)) as { query: (opts: unknown) => AsyncIterable<Record<string, unknown>> };
}

/** Lazy bridge from the Claude Agent SDK's streaming query() to our ChatClient port. */
function createClaudeSdkClient(model?: string, execute?: ExecuteConfig): ChatClient {
  return {
    async run({ system, user, sessionId, signal }) {
      const { query } = await loadClaudeSdk();
      const ctrl = new AbortController();
      signal.addEventListener("abort", () => ctrl.abort(), { once: true });
      const options: Record<string, unknown> = {
        ...claudeQueryOptions(system, sessionId, model, execute),
        abortController: ctrl,
      };
      let text = "";
      let newSession = sessionId;
      for await (const msg of query({ prompt: user, options })) {
        const m = msg as { type?: string; subtype?: string; session_id?: string; result?: string; message?: { content?: Array<{ type?: string; text?: string }> } };
        if (m.type === "system" && m.subtype === "init" && m.session_id) newSession = m.session_id;
        if (m.type === "assistant" && m.message?.content) {
          for (const block of m.message.content) if (block.type === "text" && block.text) text += block.text;
        }
        if (m.type === "result" && typeof m.result === "string") text = m.result;
      }
      return { text, ...(newSession ? { sessionId: newSession } : {}) };
    },
  };
}
