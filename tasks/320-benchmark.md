---
id: 320
title: Benchmark — does the roundtable beat a single model?
status: todo
owner: null
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
