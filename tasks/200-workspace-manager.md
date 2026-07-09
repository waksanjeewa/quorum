---
id: 200
title: Workspace manager — git worktree lifecycle
status: done
owner: claude-opus-4-8
deps: [020]
owned_paths: ["packages/core/src/workspace/"]
acceptance:
  - createWorktree(projectRoot, taskId) makes a git worktree + branch under .quorum/worktrees/<taskId>/ and returns its path
  - listWorktrees(projectRoot) enumerates active Quorum worktrees; removeWorktree cleans up worktree + branch
  - mergeWorktree(projectRoot, taskId) merges the task branch back to the base branch; returns {merged:true} or {conflict:true, files:[...]} without throwing on conflict
  - guards: clear error if projectRoot is not a git repo (suggest `git init`); refuse if the worktree/branch already exists (idempotent reuse OK)
  - tested against a real temp git repo (git init in a tmpdir); no network
---
## Notes
See DESIGN §13.2. Worktrees are the Phase-2 isolation mechanism (chosen 2026-07-09). Use `git worktree add/list/remove` via child_process. Keep all git invocation in this module so nothing else shells out to git. Branch naming: `quorum/<taskId>`.

## Journal
- [claude-opus-4-8] Workspace manager in packages/core/src/workspace/ (git.ts low-level + workspace.ts). 109 tests (5 new) against real temp git repos. createWorktree/listWorktrees/removeWorktree/mergeWorktree. Worktrees at .quorum/worktrees/<taskId>, branch quorum/<taskId>. git() helper never throws on non-zero exit (conflict = exit 1 = data). ensureGitRepo throws a `git init` hint for non-repos.
  - mergeWorktree: commits pending worktree changes (add -A + commit, no-op if clean) then `git merge --no-ff` into the base branch; on conflict returns {conflict, files} after `git merge --abort` (base repo left clean) — never throws.
  - Two real fixes found via tests: (1) return git's CANONICAL worktree path (macOS resolves /var→/private/var), so create + idempotent-reuse agree. (2) ensureQuorumIgnored: adds `.quorum/` to `.git/info/exclude` (via git-common-dir) so Quorum's worktrees/sessions never show in the USER'S `git status` — without touching their tracked .gitignore. Both improve real usability, not just the test.
  - Next: 210 executor adapter mode (canExecute + tools-enabled execute), then 220 acceptance runner, 230 execute stage.
