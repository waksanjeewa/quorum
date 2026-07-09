import type { TurnContext, TurnResult } from "@quorum/core";
import { AbortError, isAbortError, type AuthResult, type Capabilities, type ModelAdapter } from "../types.js";
import { renderContext } from "../shared/render.js";

export interface OllamaAdapterOpts {
  /** Model name, e.g. "llama3". The adapter id becomes "ollama/<model>". */
  model: string;
  /** Default http://localhost:11434 */
  baseUrl?: string;
  /** Injected for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Local Ollama adapter — the never-offline free fallback (DESIGN §5). Talks to /api/chat.
 * No usage windows (local), so it never returns usage_limit except on an explicit HTTP 429.
 */
export class OllamaAdapter implements ModelAdapter {
  readonly id: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OllamaAdapterOpts) {
    this.model = opts.model;
    this.id = `ollama/${opts.model}`;
    this.baseUrl = (opts.baseUrl ?? "http://localhost:11434").replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  capabilities(): Capabilities {
    return { passThroughCommands: false, contextWindow: 8192, costTier: "free" };
  }

  async auth(): Promise<AuthResult> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/tags`);
      if (!res.ok) return { ok: false, detail: `Ollama responded ${res.status} at ${this.baseUrl}` };
      return { ok: true, detail: `Ollama reachable at ${this.baseUrl}` };
    } catch {
      return { ok: false, detail: `Ollama not reachable at ${this.baseUrl} — is \`ollama serve\` running?` };
    }
  }

  async takeTurn(ctx: TurnContext, signal: AbortSignal): Promise<TurnResult> {
    const { system, user } = renderContext(ctx);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          stream: false,
        }),
        signal,
      });
      if (res.status === 429) return { status: "usage_limit", detail: "Ollama returned 429" };
      if (!res.ok) return { status: "error", detail: `Ollama HTTP ${res.status}`, retryable: res.status >= 500 };
      const data = (await res.json()) as { message?: { content?: string } };
      const content = data.message?.content;
      if (typeof content !== "string") return { status: "error", detail: "Ollama response missing message.content", retryable: false };
      return { status: "ok", content };
    } catch (err) {
      if (isAbortError(err) || signal.aborted) throw new AbortError();
      return { status: "error", detail: `Ollama request failed: ${String(err)}`, retryable: true };
    }
  }
}
