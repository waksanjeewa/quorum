import { spawn } from "node:child_process";

export interface CommandResult {
  command: string;
  exitCode: number;
  output: string;
}

export interface AcceptanceResult {
  passed: boolean;
  results: CommandResult[];
}

export interface RunAcceptanceOpts {
  /** Per-command timeout. Default 5 minutes. */
  timeoutMs?: number;
  /** Max captured output bytes per command. Default 8 KiB. */
  maxOutput?: number;
}

/**
 * Run a task's acceptance commands as child processes in `cwd`, capturing exit code + output
 * (DESIGN §13.3 — the objective gate before the roundtable review). Never throws on a failing
 * command (a non-zero exit is data). Honors the AbortSignal and a per-command timeout by killing
 * the child. `passed` is true only if every command exits 0.
 */
export async function runAcceptance(
  cwd: string,
  commands: string[],
  signal: AbortSignal,
  opts: RunAcceptanceOpts = {},
): Promise<AcceptanceResult> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000;
  const maxOutput = opts.maxOutput ?? 8 * 1024;
  const results: CommandResult[] = [];

  for (const command of commands) {
    if (signal.aborted) {
      results.push({ command, exitCode: 130, output: "(aborted)" });
      continue;
    }
    results.push(await runOne(cwd, command, signal, timeoutMs, maxOutput));
  }
  return { passed: results.every((r) => r.exitCode === 0), results };
}

function runOne(cwd: string, command: string, signal: AbortSignal, timeoutMs: number, maxOutput: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    // Cross-platform shell: cmd.exe on Windows, /bin/sh elsewhere.
    const child =
      process.platform === "win32"
        ? spawn(process.env["ComSpec"] ?? "cmd.exe", ["/d", "/s", "/c", command], { cwd })
        : spawn("sh", ["-c", command], { cwd });
    let output = "";
    let settled = false;
    const capture = (buf: Buffer): void => {
      if (output.length < maxOutput) output += buf.toString("utf8").slice(0, maxOutput - output.length);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);

    const finish = (exitCode: number, note?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve({ command, exitCode, output: note ? `${output}\n${note}` : output });
    };
    const kill = (): void => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000);
    };

    const timer = setTimeout(() => { kill(); finish(124, `(timed out after ${timeoutMs}ms)`); }, timeoutMs);
    const onAbort = (): void => { kill(); finish(130, "(aborted)"); };
    signal.addEventListener("abort", onAbort, { once: true });

    child.on("error", (err) => finish(127, `(spawn error: ${err.message})`));
    child.on("close", (code) => finish(code ?? 1));
  });
}

/**
 * Extract runnable commands from a task's free-text acceptance list. Convention: a line that begins
 * with `$ ` is a shell command (the rest are prose, human-verified). The plan stage should emit
 * command acceptance lines with this prefix.
 */
export function extractCommands(acceptance: string[]): string[] {
  return acceptance
    .map((line) => line.trim())
    .filter((line) => line.startsWith("$ "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}
