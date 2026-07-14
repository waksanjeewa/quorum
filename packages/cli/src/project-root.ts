import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

export interface ProjectRootOptions {
  cwd?: string;
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  homeDir?: string;
  canWrite?: (path: string) => Promise<boolean>;
  warn?: (message: string) => void;
}

const normalizeWin = (path: string): string => path.replace(/\//g, "\\").replace(/\\+$/g, "").toLowerCase();

export function isProtectedWindowsRoot(cwd: string, env: Record<string, string | undefined> = process.env): boolean {
  const current = normalizeWin(resolve(cwd));
  const systemRoot = normalizeWin(env["SystemRoot"] || env["WINDIR"] || "C:\\Windows");
  const protectedRoots = [
    systemRoot,
    `${systemRoot}\\system32`,
    `${systemRoot}\\syswow64`,
    env["ProgramFiles"],
    env["ProgramFiles(x86)"],
  ].filter((p): p is string => Boolean(p)).map((p) => normalizeWin(resolve(p)));

  return protectedRoots.some((root) => current === root || current.startsWith(`${root}\\`));
}

async function defaultCanWrite(path: string): Promise<boolean> {
  try {
    await access(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveProjectRoot(options: ProjectRootOptions = {}): Promise<string> {
  const env = options.env ?? process.env;
  const override = env["QUORUM_PROJECT_ROOT"];
  if (override?.trim()) return resolve(override.trim());

  const cwd = resolve(options.cwd ?? process.cwd());
  const platform = options.platform ?? process.platform;
  const home = resolve(options.homeDir ?? homedir());
  const canWrite = options.canWrite ?? defaultCanWrite;

  let reason = "";
  if (platform === "win32" && isProtectedWindowsRoot(cwd, env)) {
    reason = "PowerShell is in a protected Windows system folder";
  } else if (!(await canWrite(cwd))) {
    reason = "this folder is not writable";
  }

  if (!reason) return cwd;

  const fallback = home || cwd;
  options.warn?.(`${reason}; using ${fallback} for Quorum state. Run Quorum from a project folder to keep .quorum beside that project.`);
  return fallback;
}
