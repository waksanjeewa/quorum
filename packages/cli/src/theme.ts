// Terminal theme for the Quorum shell — a distinct look vs. a plain prompt. Honors NO_COLOR and
// non-TTY output (colors disabled when piped).

const enabled = process.stdout.isTTY === true && !process.env["NO_COLOR"];
const wrap = (code: string) => (s: string): string => (enabled ? `\x1b[${code}m${s}\x1b[0m` : s);

type Rgb = readonly [number, number, number];

const EMERALD: Rgb = [16, 185, 129];
const TEAL: Rgb = [14, 165, 164];
const CYAN: Rgb = [34, 211, 238];
const AMBER: Rgb = [245, 158, 11];

const fg = ([r, g, b]: Rgb): string => `38;2;${r};${g};${b}`;

export const C = {
  bold: wrap("1"),
  dim: wrap("2"),
  red: wrap("31"),
  green: wrap(fg(EMERALD)),
  yellow: wrap(fg(AMBER)),
  teal: wrap(fg(TEAL)),
  cyan: wrap(fg(CYAN)),
  amber: wrap(fg(AMBER)),
  muted: wrap("38;2;143;163;160"),
  text: wrap("38;2;230;241;238"),
  /** Quorum brand accent: emerald. */
  brand: wrap(fg(EMERALD)),
};

/** The shell prompt — a distinct brand-colored marker so you know you're inside Quorum. */
export const PROMPT = `${C.brand("◆")} ${C.bold("quorum")} ${C.dim("›")} `;

export const QUORUM_ASCII = [
  String.raw`      o-----o        ___  _   _  ___  ____  _   _ __  __`,
  String.raw`   o-/ \   / \-*    / _ \| | | |/ _ \|  _ \| | | |  \/  |`,
  String.raw`   |   \ \ / / |   | | | | | | | | | | |_) | | | | |\/| |`,
  String.raw`   o    >X<    o   | |_| | |_| | |_| |  _ <| |_| | |  | |`,
  String.raw`    \  / / \ \ /    \__\_\\___/ \___/|_| \_\\___/|_|  |_|`,
  String.raw`      o-----o         ◆  many models, working together`,
] as const;

/** Brand-correct CLI launch logo: emerald → teal → cyan letters, amber consensus subtitle. */
export function quorumLogo(): string {
  return QUORUM_ASCII.map(gradientLine).join("\n");
}

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

function gradientLine(line: string): string {
  if (!enabled) return line;
  return Array.from(line, (ch, i) => {
    if (ch === " ") return ch;
    if (ch === "*" || ch === "◆") return color24(AMBER, ch);
    return color24(interpolate(i / Math.max(line.length - 1, 1)), ch);
  }).join("");
}

function color24([r, g, b]: Rgb, s: string): string {
  return `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`;
}

function interpolate(t: number): Rgb {
  const stops: readonly [Rgb, Rgb, number] = t < 0.5 ? [EMERALD, TEAL, t * 2] : [TEAL, CYAN, (t - 0.5) * 2];
  const [from, to, local] = stops;
  return [
    Math.round(from[0] + (to[0] - from[0]) * local),
    Math.round(from[1] + (to[1] - from[1]) * local),
    Math.round(from[2] + (to[2] - from[2]) * local),
  ];
}
