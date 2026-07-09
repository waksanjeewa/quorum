---
id: 020
title: Ledger — session dir + transcript JSONL + task files
status: todo
owner: null
deps: [010]
owned_paths: ["packages/core/src/ledger/"]
acceptance:
  - createSession / appendEvent / readEvents / buildTurnContext / readTasks / writeTask per SPEC §4
  - appendEvent is atomic single-line append; readEvents skips corrupt/partial trailing lines without throwing (test: truncate a file mid-line)
  - buildTurnContext honors contextMode summary_tail (goal + summary.md + last N turns) and full
  - task files round-trip: YAML frontmatter + journal preserved byte-stable when only status changes
---
## Notes
This is the crash-safety and handoff foundation. Test resume-after-kill: write events, "crash", reopen, state identical.

## Journal
- (empty)
