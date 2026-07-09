import type { TurnContext, TurnResult, Usage } from "@quorum/core";
import { AbortError, isAbortError, type AuthResult, type Capabilities, type ModelAdapter } from "../types.js";
import { renderContext } from "../shared/render.js";
import { estimateCostUsd } from "./prices.js";

export interface HttpAdapterOpts {
  /** Full seat id, e.g. "openrouter/deepseek/deepseek-chat:free". */
  id: string;
  /** OpenAI-compatible base, e.g. "https://openrouter.ai/api/v1". */
  baseUrl: string;
  /** Model name as the endpoint expects it, e.g. "deepseek/deepseek-chat:free". */
  model: string;
  /** Resolved API key. If undefined, auth() fails with a helpful message (never crashes a turn). */
  apiKey?: string;
  /** Env var name the key comes from — surfaced in the auth message. */
  keyEnvName?: string;
  costTier?: Capabilities["costTier"];
  contextWindow?: number;
  passThroughCommands?: boolean;
  fetchImpl?: typeof fetch;
}

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * One generic OpenAI-compatible client for raw providers AND gateways (DESIGN §11b, task 130):
 * OpenRouter, a local OmniRoute/LiteLLM, or any /v1 endpoint. Pointing a seat at a gateway
 * inherits that gateway's own provider fallback beneath Quorum's seat chains — we do NOT rebuild
 * the routing layer here.
 */
export class HttpAdapter implements ModelAdapter {
  readonly id: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly keyEnvName: string;
  private readonly caps: Capabilities;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: HttpAdapterOpts) {
    this.id = opts.id;
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.model = opts.model;
    this.apiKey = opts.apiKey;
    this.keyEnvName = opts.keyEnvName ?? "API_KEY";
    this.caps = {
      passThroughCommands: opts.passThroughCommands ?? false,
      canExecute: false,
      contextWindow: opts.contextWindow ?? 128_000,
      costTier: opts.costTier ?? "api",
    };
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  capabilities(): Capabilities {
    return this.caps;
  }

  async auth(): Promise<AuthResult> {
    if (!this.apiKey) {
      return { ok: false, detail: `Missing API key — set ${this.keyEnvName} to use ${this.id}` };
    }
    return { ok: true, detail: `Key present for ${this.id}` };
  }

  async takeTurn(ctx: TurnContext, signal: AbortSignal): Promise<TurnResult> {
    if (!this.apiKey) {
      return { status: "error", detail: `Missing API key (${this.keyEnvName})`, retryable: false };
    }
    const { system, user } = renderContext(ctx);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal,
      });

      if (res.status === 429) {
        const resetsAt = retryAfterToIso(res.headers.get("retry-after"));
        return { status: "usage_limit", detail: `Rate limited (429) on ${this.id}`, ...(resetsAt ? { resetsAt } : {}) };
      }
      if (res.status === 401 || res.status === 403) {
        return { status: "error", detail: `Auth rejected (${res.status}) on ${this.id}`, retryable: false };
      }
      if (!res.ok) {
        return { status: "error", detail: `HTTP ${res.status} on ${this.id}`, retryable: res.status >= 500 };
      }

      const data = (await res.json()) as ChatCompletion;
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        return { status: "error", detail: `Malformed completion from ${this.id}`, retryable: false };
      }
      const usage = this.usageFrom(data);
      return { status: "ok", content, ...(usage ? { usage } : {}) };
    } catch (err) {
      if (isAbortError(err) || signal.aborted) throw new AbortError();
      return { status: "error", detail: `Request to ${this.id} failed: ${String(err)}`, retryable: true };
    }
  }

  private usageFrom(data: ChatCompletion): Usage | undefined {
    const inp = data.usage?.prompt_tokens;
    const out = data.usage?.completion_tokens;
    if (inp === undefined && out === undefined) return undefined;
    return {
      ...(inp !== undefined ? { inputTokens: inp } : {}),
      ...(out !== undefined ? { outputTokens: out } : {}),
      costUsd: estimateCostUsd(this.model, inp ?? 0, out ?? 0),
    };
  }
}

function retryAfterToIso(header: string | null): string | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (!Number.isNaN(secs)) return new Date(Date.now() + secs * 1000).toISOString();
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : new Date(date).toISOString();
}
