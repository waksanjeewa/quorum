import type { TurnContext } from "../types/index.js";
import type { SeatRunner } from "./engine.js";

export interface TriageResult {
  /**
   * "chat" = respond conversationally (no roundtable); "clarify" = ask one follow-up before
   * starting; "build" = a real goal to deliberate on; "meta" = a question about Quorum's OWN
   * configuration (models/seats/settings) — answer it from local config, never from the roundtable.
   */
  intent: "chat" | "clarify" | "build" | "meta";
  /** For chat/clarify intent, the conversational reply or follow-up question to show the user. */
  reply?: string;
}

const INSTRUCTIONS =
  "You are Quorum's front desk. The user typed a message. Reply with EXACTLY ONE of:\n" +
  "• BUILD — ONLY if it is clearly a concrete task or goal to plan or build (e.g. \"build a CLI\", " +
  "\"design an API for X\", \"plan a trip to Japan\", \"write a script that…\").\n" +
  "• META — if they are asking about Quorum ITSELF: its models, API keys, providers, logins, seats, " +
  "settings, agents/subagents, budgets, or what is configured / reachable / logged in. " +
  "(The app answers META from the local config — you don't need details.)\n" +
  "• CLARIFY: <one short question> — if the message is vague, incomplete, mid-typing, or you are " +
  "not sure whether it is a real goal. Ask for the missing target/scope/result. Do NOT guess BUILD.\n" +
  "• Otherwise, reply directly and warmly in 1–2 sentences for greetings, small talk, or thanks. " +
  "Never list steps or mention proposer/critic/arbiter.";

const GREETING = /^(hi|hey+|hello|yo|sup|howdy|hiya|hola|thanks|thank you|thx|ty|ok|okay|k|cool|great|nice|awesome|good (morning|afternoon|evening|night)|gm|gn)[\s!.?]*$/i;
const BUILD_START = /^(build|create|make|write|implement|design|add|fix|refactor|generate|scaffold|develop|set ?up|code|convert|port|migrate|automate)\b/i;

// A question about Quorum's own setup: needs a config subject (models/seats/…) AND a question or
// possessive context. Kept deterministic so it never reaches a model that would answer confusedly.
const META_SUBJECT = /\b(models?|seats?|providers?|config(uration)?|settings?|failover|chains?|budgets?|arbiter|proposer|critic|apis?|api ?keys?|keys?|tokens?|logged ?in|signed ?in|log ?in|at the table|agents?|swarm|subagents?|parallel|concurrency|openrouter|ollama|gemini|groq|together|fireworks|deepinfra|copilot|github|anthropic|openai|claude|codex)\b/i;
const META_CONTEXT = /\b(what|which|who|show|list|tell me|what'?s|whats|my|our|are we|am i|do i|is the|is my|current(ly)?|now|using|use|configured|set ?up|how|why|help|enable|disable|turn (on|off)|working|wrong|not|have|got)\b/i;
const TRAILING_FRAGMENT = /\b(a|an|the|to|for|with|that|this|it|me|my|our|some|something|stuff|thing|things?)$/i;
const VAGUE_TARGET = /^(a |an |the )?(app|tool|feature|thing|stuff|code|project|system|this|that|it|something)$/i;
const CONCRETE_SHORT_TARGET = /^(cli|api|sdk|mcp|csv|json|xml|yaml|parser|dashboard|website|site|page|component|script|server|bot|extension|test|tests|logo|banner|readme|docs?|file)$/i;

/** True for "what models are we using?", "show my config", "which seats?", etc. */
export function isMetaQuestion(input: string): boolean {
  const t = input.trim();
  if (BUILD_START.test(t)) return false; // "build a settings page" is a goal, not a meta question
  return META_SUBJECT.test(t) && META_CONTEXT.test(t);
}

/** True for mid-typing / underspecified goals like "build", "fix this", or "make app". */
export function isIncompleteGoal(input: string): boolean {
  const t = input.trim().replace(/\s+/g, " ");
  if (!t || GREETING.test(t) || isMetaQuestion(t)) return false;
  if (/^(can you|could you|please|pls|help|help me|i need|need|want|i want)$/i.test(t)) return true;
  const build = t.match(BUILD_START);
  if (build) {
    const rest = t.slice(build[0].length).trim();
    if (!rest || TRAILING_FRAGMENT.test(rest) || VAGUE_TARGET.test(rest)) return true;
    const meaningful = rest
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}_-]/gu, ""))
      .filter((w) => w && !/^(a|an|the|me|my|our|to|for|with|that|this|it)$/i.test(w));
    return meaningful.length === 1 && !CONCRETE_SHORT_TARGET.test(meaningful[0]!);
  }
  return t.length < 12 || /^(this|that|it|the app|not working|broken|error|issue|bug)$/i.test(t);
}

export const clarificationReply =
  "What should the models build or change? Add the target, the outcome you want, and any must-have details.";

/**
 * Instant, model-free triage for obvious cases (fixes the "hi takes 11s" latency): a bare greeting
 * gets a canned friendly reply; input starting with a build verb goes straight to the roundtable; a
 * question about Quorum's own config is flagged "meta" so the CLI answers it from local state.
 * Returns null when the input is ambiguous and warrants a real model triage call.
 */
export function quickTriage(input: string): TriageResult | null {
  const t = input.trim();
  if (t === "") return { intent: "chat", reply: "Tell me what you'd like to build or plan." };
  if (GREETING.test(t)) return { intent: "chat", reply: "Hi! What would you like to build or plan?" };
  if (isIncompleteGoal(t)) return { intent: "clarify", reply: clarificationReply };
  if (BUILD_START.test(t)) return { intent: "build" };
  if (isMetaQuestion(t)) return { intent: "meta" };
  return null;
}

/** Parse a triage response: "BUILD" → build; "META" → config question; anything else → a chat reply. */
export function parseTriage(content: string): TriageResult {
  const t = content.trim();
  if (/^build\b/i.test(t) && t.length <= 12) return { intent: "build" };
  if (/^meta\b/i.test(t) && t.length <= 12) return { intent: "meta" };
  const clarify = t.match(/^clarify\s*:\s*(.+)$/i);
  if (clarify) return { intent: "clarify", reply: clarify[1]!.trim() || clarificationReply };
  return { intent: "chat", reply: t || "Hi! Tell me what you'd like to build or plan." };
}

/**
 * Classify a shell input before spinning up the roundtable (fixes "hi" convening a committee).
 * One quick model turn: casual input gets a direct reply; a real goal returns {intent:"build"}.
 * On error, asks for clarification instead of guessing BUILD for ambiguous input. Obvious build
 * verbs are handled by quickTriage before this model call, and `/goal ...` bypasses triage.
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
    return result.status === "ok" ? parseTriage(result.content) : { intent: "clarify", reply: clarificationReply };
  } catch {
    return { intent: "clarify", reply: clarificationReply };
  }
}
