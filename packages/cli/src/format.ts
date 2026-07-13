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
    case "seat_change":
      return c(DIM, `↪ ${e.seat}: ${e.from} → ${e.to} (${e.reason})`);
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
