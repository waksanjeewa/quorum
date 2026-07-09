---
id: 030
title: ModelAdapter interface + MockAdapter + contract test suite
status: todo
owner: null
deps: [010]
owned_paths: ["packages/adapters/src/types.ts", "packages/adapters/src/mock/", "packages/adapters/src/contract/"]
acceptance:
  - ModelAdapter + TurnResult per SPEC §5
  - MockAdapter is scriptable (queue of responses incl. usage_limit and error) for use by core/daemon tests
  - exported contract test suite (describeAdapterContract(adapter)) covering: auth failure surfaces cleanly; AbortSignal honored ≤2s; usage_limit detection; malformed output → error not crash
  - MockAdapter passes its own contract suite
---
## Journal
- (empty)
