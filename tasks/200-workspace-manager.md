---
id: 200
title: Workspace manager — git worktree lifecycle
status: todo
owner: null
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
- (empty)
