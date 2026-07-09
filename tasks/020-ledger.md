---
id: 020
title: Ledger — session dir + transcript JSONL + task files
status: done
owner: claude-opus-4-8
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
- [claude-opus-4-8] Built the ledger in packages/core/src/ledger/ (paths, session, transcript, context, tasks + barrel). 21 tests green (9 new). Sessions live at <projectRoot>/.quorum/sessions/<id>; id = `YYYY-MM-DD-<slug>` via makeSessionId(date, goal) — date is INJECTED not read from a clock, so createSession takes opts.now (keeps ids deterministic/testable).
  - appendEvent: schema-validates then single `appendFile` of `JSON.stringify(e)\n` (atomic per line, one writer per session = the daemon loop). readEvents: tolerant — skips corrupt lines AND a torn trailing line (mid-write crash) via onSkip callback, never throws; missing file → []. Tested with a deliberately truncated JSON line.
  - buildTurnContext (SPEC §4): ledger owns disk-derived fields (goal, summary, recentTurns, stage, turnInStage, pendingInjections); CALLER supplies seat/role/roleInstructions since role-prompt templates live in the engine (task 050). Boundary decision — don't pull engine concerns into the ledger. stage/turnInStage/pendingInjections are DERIVED from the transcript (currentStage/turnInStage/pendingInjections exported as pure helpers for reuse). pendingInjections = human events after the last turn event.
  - Config snapshot: createSession writes config.snapshot.json into the session dir; openSession reads it back → a resumed run uses the same settings even if .quorum/config.yaml changed (supports SPEC §1 "reconstructible from session dir alone").
  - Task files (runtime session tasks/, DESIGN §4 format — DISTINCT from this dev-process tasks/ ledger): updateTaskStatus does a byte-stable in-place edit of only the `status:` line (regex on the frontmatter region) so journals never churn; test asserts `after === before.replace(...)`. serializeTaskFile/writeTask for new tasks (plan stage). TaskFrontmatter zod-validated; id coerced to string; sorted numeric by id.
  - Gotcha: needed `@types/node` (added to root devDeps) for `node:` imports + NodeJS namespace — vitest resolved fine without it but `tsc -b` failed. If you add a package using node built-ins, it's now available workspace-wide.
  - Next eligible: task 030 (adapter interface + MockAdapter + contract suite) — deps [010] met. Then 040/050 open up.
