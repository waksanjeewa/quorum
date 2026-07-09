// Terminal theme for the Quorum shell — a distinct look vs. a plain prompt. Honors NO_COLOR and
// non-TTY output (colors disabled when piped).

const enabled = process.stdout.isTTY === true && !process.env["NO_COLOR"];
const wrap = (code: string) => (s: string): string => (enabled ? `\x1b[${code}m${s}\x1b[0m` : s);

export const C = {
  bold: wrap("1"),
  dim: wrap("2"),
  red: wrap("31"),
  green: wrap("32"),
  yellow: wrap("33"),
  blue: wrap("34"),
  magenta: wrap("35"),
  cyan: wrap("36"),
  /** Quorum brand accent (bright magenta). */
  brand: wrap("95"),
};

/** The shell prompt — a distinct brand-colored marker so you know you're inside Quorum. */
export const PROMPT = `${C.brand("◆")} ${C.bold("quorum")} ${C.dim("›")} `;

/** A boxed banner for the shell header. */
export function banner(lines: string[]): string {
  const width = Math.max(...lines.map((l) => stripAnsi(l).length));
  const top = C.brand("╭" + "─".repeat(width + 2) + "╮");
  const bot = C.brand("╰" + "─".repeat(width + 2) + "╯");
  const body = lines
    .map((l) => `${C.brand("│")} ${l}${" ".repeat(width - stripAnsi(l).length)} ${C.brand("│")}`)
    .join("\n");
  return `${top}\n${body}\n${bot}`;
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
