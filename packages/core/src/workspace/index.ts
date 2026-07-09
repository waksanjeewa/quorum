// Workspace manager (DESIGN §13.2) — git worktree isolation for the Workshop.
export {
  createWorktree,
  listWorktrees,
  removeWorktree,
  mergeWorktree,
  type Worktree,
  type MergeResult,
} from "./workspace.js";
export { git, ensureGitRepo, currentBranch, branchExists, type GitResult } from "./git.js";
