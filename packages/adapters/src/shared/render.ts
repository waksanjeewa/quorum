import type { TranscriptEvent, TurnContext } from "@quorum/core";

/** Provider-neutral rendering of a turn context into a system + user message pair. */
export interface RenderedPrompt {
  system: string;
  user: string;
}

function renderEvent(e: TranscriptEvent): string | null {
  switch (e.type) {
    case "turn":
      return `[${e.seat}] ${e.content}`;
    case "human":
      return `[human] ${e.content}`;
    case "seat_change":
      return `(seat ${e.seat} handed off ${e.from} → ${e.to})`;
    case "stage":
      return `(stage → ${e.to})`;
    default:
      return null;
  }
}

/**
 * Turn a TurnContext into a portable prompt every chat provider can consume (SPEC §5). Used by the
 * Ollama and generic HTTP adapters, and as the message body for the SDK adapters.
 */
export function renderContext(ctx: TurnContext): RenderedPrompt {
  const system = ctx.roleInstructions;
  const lines: string[] = [`Goal: ${ctx.goal}`, `Stage: ${ctx.stage} (turn ${ctx.turnInStage})`];
  if (ctx.summary) lines.push(`\nSummary so far:\n${ctx.summary}`);
  const convo = ctx.recentTurns.map(renderEvent).filter((l): l is string => l !== null);
  if (convo.length > 0) lines.push(`\nConversation so far:\n${convo.join("\n")}`);
  if (ctx.pendingInjections.length > 0) {
    lines.push(`\nHuman messages you MUST address:\n${ctx.pendingInjections.map((m) => `- ${m}`).join("\n")}`);
  }
  lines.push(`\nIt is now your turn as the ${ctx.role}. Respond, then end with a \`move:\` line if you make one.`);
  return { system, user: lines.join("\n") };
}
