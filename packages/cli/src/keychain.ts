import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";

const exec = promisify(execFile);
const SERVICE = "quorum";

/**
 * Secure API-key storage. Uses the macOS Keychain (via `security`) so credentials never live in
 * files (a core Quorum principle). On other platforms it falls back to env vars only — the key is
 * not persisted and the user is told to export it. Keys are stored under account = the env-var name
 * (e.g. OPENROUTER_API_KEY) so adapters resolve them uniformly.
 */
export const keychainAvailable = (): boolean => platform() === "darwin";

export async function setSecret(account: string, secret: string): Promise<boolean> {
  if (!keychainAvailable()) return false;
  await exec("security", ["add-generic-password", "-a", account, "-s", SERVICE, "-w", secret, "-U"]);
  return true;
}

export async function getSecret(account: string): Promise<string | undefined> {
  if (!keychainAvailable()) return undefined;
  try {
    const { stdout } = await exec("security", ["find-generic-password", "-a", account, "-s", SERVICE, "-w"]);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function deleteSecret(account: string): Promise<void> {
  if (!keychainAvailable()) return;
  try {
    await exec("security", ["delete-generic-password", "-a", account, "-s", SERVICE]);
  } catch {
    /* not present */
  }
}

/** Env-var names to look up in the Keychain: built-in direct providers + any from config. */
export function knownKeyEnvs(config: { providers: Record<string, { keyEnv: string }> }): string[] {
  const builtin = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY"];
  return [...new Set([...builtin, ...Object.values(config.providers).map((p) => p.keyEnv)])];
}

/**
 * Build an env map that layers stored Keychain secrets under the given env-var names on top of
 * process.env (real env wins). Passed to the daemon so HTTP adapters can resolve provider keys.
 */
export async function resolveSecretsEnv(keyEnvNames: string[]): Promise<Record<string, string | undefined>> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const name of keyEnvNames) {
    if (env[name]) continue; // a real env var takes precedence
    const stored = await getSecret(name);
    if (stored) env[name] = stored;
  }
  return env;
}
