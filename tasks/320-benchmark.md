---
id: 320
title: Benchmark — does the roundtable beat a single model?
status: done
owner: claude-opus-4-8
deps: [050]
owned_paths: ["bench/"]
acceptance:
  - a runnable harness (bench/) takes a set of goals + a rubric, runs each goal in two modes —
    single-model and full roundtable (same model(s)) — and records the converged artifacts
  - an LLM-judge (a strong model, blind to which is which) scores each pair on the rubric; results
    aggregated into a table (win/tie/loss, mean score)
  - a short REPORT.md summarizing the numbers on a first goal set
  - reproducible: seeds/config committed, cost + wall-clock logged per run
---
## Notes
This is the launch story: evidence that multi-model deliberation produces better output than one
model alone, not just a nicer process. Keep the goal set small but varied (a coding task, a design
decision, a plan). Use a different model as judge than the ones under test to reduce bias. Real runs
cost tokens — document the spend. Consider free models for the contestants and one paid judge.

## Journal
- (empty)

## Journal
- [claude-opus-4-8] Benchmark harness (bench/run.mjs) + real run. Design: same model (Codex) both modes — one direct call vs full brainstorm roundtable — judged BLIND by Claude (different model). First run: roundtable 2 / single 0 / ties 0 (scores 8v6, 8v8-edge). Blind slot alternated (roundtable=A then B) and judge picked it both times → not position bias. bench/REPORT.md committed.
  - TWO harness bugs found+fixed en route (good lessons): (1) judge asked for bare JSON → Claude wrapped it in prose → unparseable; switched to line format (WINNER:/SCORE_A:/SCORE_B:/REASON:) + regex. (2) passed the TASK as the judge's `goal` → Claude ANSWERED the task instead of judging (the goal field is deliberately dominant so seated models work on it — Quorum's own design); fixed by putting the full judging instruction in the goal slot.
  - CAVEAT: n=2 is a SIGNAL not proof. Grow GOALS in run.mjs for launch-grade numbers. Frugal-mode (free-drafts/paid-verifies) angle needs an OpenRouter key (user removed theirs) — this run tested the more fundamental "does deliberation improve the same model's output?" = yes, on this small sample.
