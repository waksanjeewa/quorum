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

/** The shell prompt — a branded chip so it's obvious you're *inside* the Quorum shell. */
const chip = enabled
  ? `\x1b[48;2;16;185;129m\x1b[38;2;4;18;14m\x1b[1m ◆ quorum \x1b[0m` // emerald chip, dark text
  : "◆ quorum";
export const PROMPT = `${chip} ${C.brand("❯")} `;

/** Same chip with a live state suffix (e.g. the running stage), for the in-session prompt. */
export function promptWith(state?: string): string {
  return state ? `${chip}${C.dim(" · " + state)} ${C.brand("❯")} ` : PROMPT;
}

const COMPACT_MARK = [
  "        ●       ",
  "    ╭───┴───╮   ",
  "  ●─╯  ◢◣  ╰─● ",
  "  │    ◥◤    │  ",
  "  ●─╮  ◢◣  ╭─● ",
  "    ╰───┬───╯   ",
  "        ●       ",
] as const;

export const QUORUM_ASCII_WORD = [
  String.raw`  ___  _   _  ___  ____  _   _ __  __`,
  String.raw` / _ \| | | |/ _ \|  _ \| | | |  \/  |`,
  String.raw`| | | | | | | | | | |_) | | | | |\/| |`,
  String.raw`| |_| | |_| | |_| |  _ <| |_| | |  | |`,
  String.raw` \__\_\\___/ \___/|_| \_\\___/|_|  |_|`,
] as const;

export const QUORUM_TERMINAL_LOCKUP = [
  `${COMPACT_MARK[0]} ${QUORUM_ASCII_WORD[0]}`,
  `${COMPACT_MARK[1]} ${QUORUM_ASCII_WORD[1]}`,
  `${COMPACT_MARK[2]} ${QUORUM_ASCII_WORD[2]}`,
  `${COMPACT_MARK[3]} ${QUORUM_ASCII_WORD[3]}`,
  `${COMPACT_MARK[4]} ${QUORUM_ASCII_WORD[4]}`,
  `${COMPACT_MARK[5]}   many models, working together`,
  `${COMPACT_MARK[6]}   local-first consensus`,
] as const;

/** Logo-v2-inspired CLI launch lockup: compact mark + correct ASCII QUORUM word. */
export function quorumLogo(): string {
  if (!enabled) return QUORUM_TERMINAL_LOCKUP.join("\n");
  const e = color24(EMERALD, "●");
  const word = QUORUM_ASCII_WORD.map((line) => C.text(C.bold(line)));
  return [
    `        ${e}        ${word[0]}`,
    `    ${color24(TEAL, "╭───┴───╮")}    ${word[1]}`,
    `  ${color24(EMERALD, "●")}${color24(TEAL, "─╯")}  ${color24(EMERALD, "◢")}${color24(CYAN, "◣")}  ${color24(TEAL, "╰─")}${color24(AMBER, "●")}  ${word[2]}`,
    `  ${color24(TEAL, "│")}    ${color24(CYAN, "◥")}${color24(EMERALD, "◤")}    ${color24(TEAL, "│")}   ${word[3]}`,
    `  ${color24(CYAN, "●")}${color24(TEAL, "─╮")}  ${color24(TEAL, "◢")}${color24(CYAN, "◣")}  ${color24(TEAL, "╭─")}${color24(CYAN, "●")}  ${word[4]}`,
    `    ${color24(TEAL, "╰───┬───╯")}      ${C.muted("many models, working together")}`,
    `        ${color24(TEAL, "●")}        ${C.muted("local-first consensus")}`,
  ].join("\n");
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

function color24([r, g, b]: Rgb, s: string): string {
  return `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`;
}
