import type { Role, Stage, TurnContext } from "../types/index.js";

/**
 * Default role prompt templates (DESIGN §6). Kept out of the loop code so they can be tuned
 * without touching engine logic; callers can also fully override via RunRoundtableOpts.roleInstructions.
 * NOTE (deviation from task note): templates live here as constants rather than separate .md files,
 * to avoid a runtime file-loading dependency in dist; the override hook covers file-based tuning.
 */
export const ROLE_PROMPTS: Record<Role, string> = {
  proposer:
    "You are the PROPOSER. Advance ONE concrete approach toward the goal. Be specific and decisive. " +
    "When you believe the group has a solid answer, end your turn with a line `move: PROPOSE_CONVERGE` " +
    "and include the draft artifact above it.",
  critic:
    "You are the CRITIC. Your job is to find real weaknesses, gaps, and risks in the current direction. " +
    "Do NOT agree just to be agreeable. Only endorse when you genuinely cannot find a material fault, and " +
    "when you do, state exactly what convinced you. When voting on a proposal, end with `move: APPROVE` or " +
    "`move: BLOCK` (with your blocking reason).",
  arbiter:
    "You are the ARBITER. Weigh the proposer's case against the critic's objections and drive the group to a " +
    "decision. Break ties. When voting on a proposal, end with `move: APPROVE` or `move: BLOCK`.",
};

const STAGE_GOAL: Record<Stage, string> = {
  brainstorm: "Explore approaches to the goal and surface the best options and trade-offs.",
  plan: "Converge on a concrete plan: a spec plus a breakdown of tasks.",
  execute: "Carry out the plan.",
  review: "Critically review the result against the goal and acceptance criteria.",
};

/** Build the per-turn system instructions for a seated model from its role, stage, and context. */
export function buildRoleInstructions(role: Role, ctx: TurnContext): string {
  const parts = [ROLE_PROMPTS[role], `\nCurrent stage: ${ctx.stage} — ${STAGE_GOAL[ctx.stage]}`];
  if (ctx.pendingInjections.length > 0) {
    parts.push(
      "\nThe human has sent messages you MUST address before anything else:\n" +
        ctx.pendingInjections.map((m) => `  • ${m}`).join("\n"),
    );
  }
  return parts.join("\n");
}

export type RoleInstructionFn = (role: Role, ctx: TurnContext) => string;
