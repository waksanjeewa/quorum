import type { TurnContext } from "../types/index.js";
import type { SeatRunner } from "./engine.js";

export interface DiffReview {
  approved: boolean;
  reason?: string;
}

export interface ReviewInput {
  taskId: string;
  title: string;
  diff: string;
  acceptancePassed: boolean;
}

const INSTRUCTIONS =
  "You are a strict senior code reviewer. Review the diff below for correctness, security, and " +
  "quality against the task. Automated acceptance tests have already run. If the change is good " +
  "enough to merge, reply with EXACTLY: APPROVE. Otherwise reply: BLOCK: <one concise reason>. " +
  "Do not explain further.";

/** Parse a reviewer response into an approve/block decision. */
export function parseReview(content: string, acceptancePassed: boolean): DiffReview {
  const t = content.trim();
  if (/^approve\b/i.test(t)) return { approved: true };
  const block = /^block\s*:?\s*(.*)/i.exec(t);
  if (block) return { approved: false, reason: block[1]?.trim() || "reviewer blocked the change" };
  // Ambiguous reviewer output: fall back to the objective gate (tests passing).
  return acceptancePassed ? { approved: true } : { approved: false, reason: "acceptance failed" };
}

/**
 * Have a capable model review an executor's diff before it merges (DESIGN §13.1 step 5). This is the
 * subjective gate on top of the objective acceptance gate — "tests pass" is necessary, not sufficient.
 * On reviewer error, defers to whether acceptance passed (never blocks a green build spuriously).
 */
export async function reviewDiff(runner: SeatRunner, input: ReviewInput, signal?: AbortSignal): Promise<DiffReview> {
  const truncated = input.diff.length > 12_000 ? input.diff.slice(0, 12_000) + "\n…(diff truncated)" : input.diff;
  const ctx: TurnContext = {
    seat: "reviewer",
    role: "critic",
    stage: "review",
    turnInStage: 1,
    goal: input.title,
    summary: "",
    recentTurns: [],
    pendingInjections: [],
    roleInstructions:
      `${INSTRUCTIONS}\n\nTask: ${input.title}\nAcceptance tests: ${input.acceptancePassed ? "PASSED" : "FAILED"}\n\nDiff:\n${truncated || "(no changes)"}`,
  };
  try {
    const result = await runner.takeTurn(ctx, signal ?? new AbortController().signal);
    return result.status === "ok" ? parseReview(result.content, input.acceptancePassed) : { approved: input.acceptancePassed };
  } catch {
    return { approved: input.acceptancePassed };
  }
}
