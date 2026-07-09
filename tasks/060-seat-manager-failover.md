---
id: 060
title: Seat manager — failover chains + proactive quota
status: done
owner: claude-opus-4-8
deps: [050]
owned_paths: ["packages/core/src/seats/"]
acceptance:
  - on usage_limit or non-retryable error, walk the seat's chain, emit seat_change event, retry same turn with next model (test with scripted MockAdapters)
  - chain exhausted → seat paused + control event for human; other seats continue if quorum still possible (≥2 active), else session pauses
  - if adapter has probeQuota and remainingPct below threshold (config, default 10%), hand off proactively at next turn boundary
  - failed model is retried after its resetsAt (if known) or on manual /seat command
---
## Journal
- [claude-opus-4-8] SeatManager in packages/adapters/src/seat-manager.ts (44 tests, 6 new). Bridges ModelAdapter → the engine's SeatRunner port. Takes SessionConfig + an AdapterRegistry (id→ModelAdapter; the daemon builds the registry from config providers/keys). `seats()` = first available runner per chain; `failover(seatId,result)` = advance cursor to next available model (skips missing + cooling-down), null when exhausted — exactly the hook runRoundtable already calls. `resetSeat()` for the /seat command + cooldown expiry.
  - Proactive quota (DESIGN §12): QuotaAwareRunner wraps each adapter; before a turn it calls probeQuota() and, if remainingPct < threshold (default 10, configurable), returns usage_limit WITHOUT calling the model → reuses the exact failover path. So Codex's app-server quota → proactive handoff for free; Claude (no probeQuota) just never triggers it (reactive only). Clean.
  - Cooldown: usage_limit with resetsAt records adapter-id → reset time; isCoolingDown skips it until now >= reset. Injected `now` clock for tests.
  - Engine already handles the rest of the acceptance: emits seat_change + retries when failover returns a runner; pauses seat + continues if ≥2 active, else session pause (<2 quorum check).
  - Next: 070 summary maintainer, then 080 daemon wires SeatManager + runRoundtable together.
