// @quorum/adapters — ModelAdapter implementations + mock. See SPEC.md §5.
// The contract suite (contract/adapter-contract.ts) is test-only infra, imported directly
// by adapter *.test.ts files; it is intentionally not re-exported from the built package.
export const ADAPTERS_PACKAGE = "@quorum/adapters";
export {
  AbortError,
  isAbortError,
  abortableDelay,
  type ModelAdapter,
  type AuthResult,
  type Capabilities,
  type QuotaHint,
} from "./types.js";
export { MockAdapter, type MockAdapterOpts, type MockStep } from "./mock/mock-adapter.js";
export { SeatManager, type AdapterRegistry, type SeatManagerOpts } from "./seat-manager.js";
export { renderContext, type RenderedPrompt } from "./shared/render.js";
export { OllamaAdapter, type OllamaAdapterOpts } from "./ollama/ollama-adapter.js";
export { HttpAdapter, type HttpAdapterOpts } from "./http/http-adapter.js";
export { resolveHttpAdapter, DIRECT_PROVIDERS, type ResolveHttpOpts } from "./http/presets.js";
export { estimateCostUsd, priceFor } from "./http/prices.js";
export { SdkAdapter, type ChatClient, type SdkAdapterOpts } from "./sdk/chat-client.js";
export { createClaudeAdapter, type ClaudeAdapterOpts } from "./claude/claude-adapter.js";
export { createCodexAdapter, type CodexAdapterOpts } from "./codex/codex-adapter.js";
