---
id: 030
title: ModelAdapter interface + MockAdapter + contract test suite
status: done
owner: claude-opus-4-8
deps: [010]
owned_paths: ["packages/adapters/src/types.ts", "packages/adapters/src/mock/", "packages/adapters/src/contract/"]
acceptance:
  - ModelAdapter + TurnResult per SPEC §5
  - MockAdapter is scriptable (queue of responses incl. usage_limit and error) for use by core/daemon tests
  - exported contract test suite (describeAdapterContract(adapter)) covering: auth failure surfaces cleanly; AbortSignal honored ≤2s; usage_limit detection; malformed output → error not crash
  - MockAdapter passes its own contract suite
---
## Journal
- [claude-opus-4-8] Built ModelAdapter interface (src/types.ts), MockAdapter (src/mock/), and the shared contract suite (src/contract/adapter-contract.ts). 31 tests green (10 new). Interface exactly per SPEC §5: id, auth()→{ok,detail}, capabilities()→{passThroughCommands,contextWindow,costTier}, takeTurn(ctx,signal)→TurnResult, optional probeQuota().
  - Standardized cancellation: exported `AbortError` class + `isAbortError()` + `abortableDelay(ms,signal)` helper so ALL adapters reject uniformly on abort. Adapters MUST reject with AbortError on signal (not resolve to error). Reuse abortableDelay in real adapters for any wait.
  - Contract suite design: `describeAdapterContract(name, harness)` where ContractHarness has makeHealthy/makeAuthFailure/makeUsageLimited/makeHanging/makeMalformed factories. Real adapters (040/110/120/130) implement a harness backed by STUBBED transports and call describeAdapterContract — that's the acceptance mechanism for all of them. `makeTestContext(overrides)` helper builds a TurnContext. Covers: id/caps present, healthy→ok, auth failure resolves (no throw), usage_limit detected, abort honored <2s (bounded via Promise.race), malformed→error (never throws).
  - IMPORTANT build note: adapter-contract.ts imports vitest, so it's EXCLUDED from tsc build (`src/contract/**` in tsconfig exclude) and vitest added to adapters devDeps. It is test-only infra — NOT re-exported from the package barrel. Adapter test files import it via relative path `../contract/adapter-contract.js`. Keep new test-only helpers under src/contract/ or name them *.test.ts.
  - MockAdapter is the reference impl + powers core/daemon tests: scriptable queue (MockStep = TurnResult | (ctx)=>TurnResult | {kind:delay|hang|throw}); exhausted script → echo "ok"; probeQuota defined only when `quota` opt set; `.calls` counter for assertions. Deterministic (no clocks/randomness).
  - Next eligible: 040 (ollama), 050 (roundtable engine — the heart), 110/120/130 (real adapters) all have deps met now. Recommend 050 next to validate the deliberation protocol early (DESIGN §6 riskiest assumption), using MockAdapter.
