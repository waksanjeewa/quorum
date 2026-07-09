# Quorum — Agent Briefing

You are one of several AI agents (Claude, Codex, or others) building **Quorum** — a local-first tool where multiple AI models collaborate on one goal with usage-limit-aware handoff. **No agent owns this project**: another model may have worked before you and another may continue after you. Everything you need is on disk; everything you learn must go back to disk.

## Read order (before writing any code)
1. [DESIGN.md](DESIGN.md) — what we're building and why (decisions are settled; don't relitigate).
2. [SPEC.md](SPEC.md) — stack, repo layout, interfaces, contracts. Follow it exactly; if you must deviate, record the deviation and reason in your task's journal.
3. `tasks/` — the ledger. One file per task, YAML frontmatter + journal.

## Workflow (every session)
1. Pick the **lowest-numbered task** with `status: todo` whose `deps` are all `done`. If a task is `in_progress` with a journal entry from you (your model family), resume it instead.
2. Set `status: in_progress` and put your model name in `owner`.
3. Work **only within the task's `owned_paths`** (plus shared root config when the task says so). Never touch paths owned by another `in_progress` task.
4. **Append a journal entry** to the task file every session: what you did, what's next, any gotcha the next agent needs. This is mandatory — it is the handoff mechanism.
5. A task is `done` only when **all acceptance criteria pass**, including `pnpm test`. Run the tests; don't claim green without running them.
6. If blocked, set `status: blocked`, journal the reason, and move to the next eligible task.

## Rules
- Node ≥20, TypeScript strict, ESM, pnpm workspaces, vitest, zod. Dependency direction: `core ← adapters ← daemon ← cli` (dashboard talks HTTP/WS only).
- Small commits, imperative messages, one task per commit prefix: `[042] add ollama adapter`.
- No new runtime dependencies without journaling the justification.
- Never store credentials in files; env vars / OS keychain / existing CLI logins only.
- If you find a real design gap (not a preference), journal it in the task and add a line to `DECISIONS-NEEDED.md` (create if absent) for the human — then keep working around it if possible.
