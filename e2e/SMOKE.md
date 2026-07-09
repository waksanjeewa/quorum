# Quorum — Manual Smoke Test (real models)

The automated e2e (`walking-skeleton.test.ts`) uses MockAdapters. This checklist exercises the
same flow against **real** models. Do it before tagging a release.

## A. Free / local only (Ollama)

Prereqs: [Ollama](https://ollama.com) running (`ollama serve`) with a model pulled (`ollama pull llama3`).

1. In a scratch project dir, create `.quorum/config.yaml` (or rely on the default 3-Ollama-seat config):
   ```yaml
   seats:
     proposer: { chain: [ollama/llama3] }
     critic:   { chain: [ollama/llama3] }
     arbiter:  { chain: [ollama/llama3] }
   budgets: { max_turns_per_stage: 10 }
   ```
2. `quorum start "plan a birthday party"`
   - [ ] Prints a session id + dashboard URL
   - [ ] Transcript streams in the terminal, seats alternate (proposer → critic → arbiter)
   - [ ] Open the dashboard URL — events appear live, seat cards show `ollama/llama3`
3. In the dashboard input box, type `focus on a picnic theme` and Send
   - [ ] A `you` message appears; the next model turn acknowledges it
4. Click **Pause** → turns stop; **Resume** → they continue
5. Click **STOP** (or Ctrl+C in the terminal)
   - [ ] Everything halts within a few seconds
6. Confirm artifacts on disk under `.quorum/sessions/<id>/`:
   - [ ] `transcript.jsonl` present and append-only
   - [ ] `summary.md` written (updates every few turns)
   - [ ] `artifacts/ideas.md` and/or `spec.md` if it converged

## B. Cross-provider failover (the headline)

Requires a Claude Code login (`claude login`) and/or a Codex login (`codex login`), and optionally an
OpenRouter key (`export OPENROUTER_API_KEY=...`) with a free model as the floor.

```yaml
seats:
  proposer: { chain: [claude, openrouter/deepseek/deepseek-chat:free, ollama/llama3] }
  critic:   { chain: [codex,  openrouter/deepseek/deepseek-chat:free, ollama/llama3] }
  arbiter:  { chain: [openrouter/google/gemini-2.5-pro, ollama/llama3] }
budgets: { max_turns_per_stage: 12 }
```

1. `quorum start "design a REST API for a todo app"`
   - [ ] Claude + Codex take their seats (check seat cards)
   - [ ] Deliberation converges on a plan; `spec.md` written
2. Drive one seat to its usage limit (or wait for a real limit), and confirm:
   - [ ] A `seat_change` event appears (`reason: usage_limit`)
   - [ ] The seat continues on the next model in its chain — **the session never dies**
3. Kill Ollama / unset keys mid-run to force chain exhaustion on a seat:
   - [ ] That seat pauses; if ≥2 seats remain, others continue; else the session pauses for you

## C. Adapter reality checks (correct the journals if these differ)

These paths are best-effort (SDKs not exercised in CI). Verify and fix mappings if needed:
- [ ] `CLAUDE_TEST=1` — Claude Agent SDK `query()` message shapes (assistant text, `result`, `session_id`)
- [ ] `CODEX_TEST=1` — Codex SDK `startThread/resumeThread/run`, `finalResponse`, and
      app-server `account/rateLimits/read` for `probeQuota()`

Record anything that differs in the relevant `tasks/1x0-*.md` journal.

## D. Phase 2 — the Workshop (executor edits code, real repo)

Requires a `codex` or `claude` login and a target **git repo**.

1. In a scratch git repo, seed a session with a runtime task whose acceptance is a command
   (a `$ `-prefixed acceptance line, e.g. `$ grep -q "Hello" hello.txt`).
2. Run the execute stage with an execute-mode executor (`createCodexAdapter({ execute: { workingDirectory } })`).
   - [ ] `task_start` → executor works in `.quorum/worktrees/<id>/` (isolated branch `quorum/<id>`)
   - [ ] the executor actually creates/edits the file
   - [ ] `task_result passed=true` (acceptance command ran in the worktree)
   - [ ] `merge merged` → the change lands on your base branch; task marked `done`
3. Force a usage limit mid-task → `seat_change`, next chain model resumes the **same** worktree.
4. STOP mid-execute → executor child dies < 6s; the worktree persists (task resumable).

> Verified 2026-07-09: a real Codex executor created `hello.txt` = "Hello, Quorum!" and merged to main in ~78s.
