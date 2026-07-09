import type { TurnContext } from "../types/index.js";
import type { SeatRunner } from "./engine.js";

export interface TriageResult {
  /** "chat" = respond conversationally (no roundtable); "build" = a real goal to deliberate on. */
  intent: "chat" | "build";
  /** For chat intent, the conversational reply to show the user. */
  reply?: string;
}

const INSTRUCTIONS =
  "You are Quorum's front desk. The user typed a message. Decide:\n" +
  "• If it is a concrete task or goal to plan or build (e.g. \"build a CLI\", \"design an API\", " +
  "\"plan a trip\", \"write a script that…\"), reply with EXACTLY the single word: BUILD\n" +
  "• Otherwise — a greeting, small talk, a question about you or your abilities, thanks, or " +
  "something too vague to act on — just reply to the user directly and warmly in 1–3 sentences. " +
  "Do NOT start planning, do NOT list steps, do NOT mention proposer/critic/arbiter.";

const GREETING = /^(hi|hey+|hello|yo|sup|howdy|hiya|hola|thanks|thank you|thx|ty|ok|okay|k|cool|great|nice|awesome|good (morning|afternoon|evening|night)|gm|gn)[\s!.?]*$/i;
const BUILD_START = /^(build|create|make|write|implement|design|add|fix|refactor|generate|scaffold|develop|set ?up|code|convert|port|migrate|automate)\b/i;

/**
 * Instant, model-free triage for obvious cases (fixes the "hi takes 11s" latency): a bare greeting
 * gets a canned friendly reply; input starting with a build verb goes straight to the roundtable.
 * Returns null when the input is ambiguous and warrants a real model triage call.
 */
export function quickTriage(input: string): TriageResult | null {
  const t = input.trim();
  if (t === "") return { intent: "chat", reply: "Tell me what you'd like to build or plan." };
  if (GREETING.test(t)) return { intent: "chat", reply: "Hi! What would you like to build or plan?" };
  if (BUILD_START.test(t)) return { intent: "build" };
  return null;
}

/** Parse a triage response: exactly "BUILD" → build; anything else → a chat reply. */
export function parseTriage(content: string): TriageResult {
  const t = content.trim();
  if (/^build\b/i.test(t) && t.length <= 12) return { intent: "build" };
  return { intent: "chat", reply: t || "Hi! Tell me what you'd like to build or plan." };
}

/**
 * Classify a shell input before spinning up the roundtable (fixes "hi" convening a committee).
 * One quick model turn: casual input gets a direct reply; a real goal returns {intent:"build"}.
 * On error, defaults to "build" so real work is never blocked.
 */
export async function triage(runner: SeatRunner, userInput: string, signal?: AbortSignal): Promise<TriageResult> {
  const ctx: TurnContext = {
    seat: "frontdesk",
    role: "arbiter",
    stage: "brainstorm",
    turnInStage: 1,
    goal: userInput,
    summary: "",
    recentTurns: [],
    pendingInjections: [],
    roleInstructions: INSTRUCTIONS,
  };
  try {
    const result = await runner.takeTurn(ctx, signal ?? new AbortController().signal);
    return result.status === "ok" ? parseTriage(result.content) : { intent: "build" };
  } catch {
    return { intent: "build" };
  }
}
