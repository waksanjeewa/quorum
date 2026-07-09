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
