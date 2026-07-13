import type { TranscriptEvent } from "@quorum/core";

const COLORS = [
  "\x1b[38;2;16;185;129m",
  "\x1b[38;2;14;165;164m",
  "\x1b[38;2;34;211;238m",
  "\x1b[38;2;245;158;11m",
  "\x1b[38;2;230;241;238m",
];
const RESET = "\x1b[0m";
const DIM = "\x1b[38;2;143;163;160m";

function seatColor(seat: string): string {
  let h = 0;
  for (const ch of seat) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

/** One-line, seat-colored rendering of a transcript event for terminal streaming (SPEC §8). */
export function formatEvent(e: TranscriptEvent, color = true): string {
  const c = (code: string, s: string): string => (color ? `${code}${s}${RESET}` : s);
  switch (e.type) {
    case "turn": {
      const move = e.move ? c(DIM, ` [${e.move}]`) : "";
      return `${c(seatColor(e.seat), e.seat.padEnd(9))} ${c(DIM, e.model)}${move}\n  ${e.content.replace(/\n/g, "\n  ")}`;
    }
    case "human":
      return `${c("\x1b[1m", "you".padEnd(9))} ${e.content}`;
    case "seat_change": {
      const base = `↪ ${e.seat}: ${e.from} → ${e.to} (${e.reason})${e.detail ? `: ${e.detail.replace(/\s+/g, " ").slice(0, 160)}` : ""}`;
      // Known Codex snag: the account's default model is newer than any released Codex, or a
      // ChatGPT-login account can't use the requested model. Failover already covered it — just tip.
      const codexModelSnag = e.from.startsWith("codex") && /newer version of Codex|not supported when using Codex/i.test(e.detail ?? "");
      const tip = codexModelSnag ? "\n  tip: update the Codex app, or drop the codex seat with /models, or use an API key (openai-api / github / openrouter)." : "";
      return c(DIM, base + tip);
    }
    case "stage":
      return c("\x1b[1m", `── stage → ${e.to} ──`);
    case "control":
      return c(DIM, `• ${e.action}${e.detail ? `: ${e.detail}` : ""} (${e.by})`);
    case "thinking":
      return c(DIM, `◌ ${e.seat} (${e.model}) is thinking…`);
    default:
      return "";
  }
}
