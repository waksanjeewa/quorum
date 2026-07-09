---
id: 060
title: Seat manager — failover chains + proactive quota
status: todo
owner: null
deps: [050]
owned_paths: ["packages/core/src/seats/"]
acceptance:
  - on usage_limit or non-retryable error, walk the seat's chain, emit seat_change event, retry same turn with next model (test with scripted MockAdapters)
  - chain exhausted → seat paused + control event for human; other seats continue if quorum still possible (≥2 active), else session pauses
  - if adapter has probeQuota and remainingPct below threshold (config, default 10%), hand off proactively at next turn boundary
  - failed model is retried after its resetsAt (if known) or on manual /seat command
---
## Journal
- (empty)
