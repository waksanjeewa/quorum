import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";

const exec = promisify(execFile);
const SERVICE = "quorum";

/**
 * Secure API-key storage — credentials never live in files (a core Quorum principle):
 *  • macOS  → Keychain via `security`
 *  • Linux  → libsecret via `secret-tool` (GNOME Keyring / KWallet), if installed
 *  • else   → env vars only (the key isn't persisted; the user is told to export it)
 * Keys are stored under account = the env-var name (e.g. OPENROUTER_API_KEY) so adapters resolve
 * them uniformly.
 */
type Backend = "macos" | "secret-tool" | "none";
let backendCache: Backend | undefined;

async function backend(): Promise<Backend> {
  if (backendCache) return backendCache;
  if (platform() === "darwin") return (backendCache = "macos");
  if (platform() === "linux") {
    const ok = await exec("secret-tool", ["--version"]).then(() => true).catch(() => false);
    return (backendCache = ok ? "secret-tool" : "none");
  }
  return (backendCache = "none");
}

export function keychainAvailable(): boolean {
  return platform() === "darwin" || platform() === "linux";
}

export async function setSecret(account: string, secret: string): Promise<boolean> {
  const b = await backend();
  if (b === "macos") {
    await exec("security", ["add-generic-password", "-a", account, "-s", SERVICE, "-w", secret, "-U"]);
    return true;
  }
  if (b === "secret-tool") {
    await new Promise<void>((resolve, reject) => {
      const child = execFile("secret-tool", ["store", "--label", `${SERVICE}:${account}`, "service", SERVICE, "account", account], (err) => (err ? reject(err) : resolve()));
      child.stdin?.end(secret);
    });
    return true;
  }
  return false;
}

export async function getSecret(account: string): Promise<string | undefined> {
  const b = await backend();
  try {
    if (b === "macos") {
      const { stdout } = await exec("security", ["find-generic-password", "-a", account, "-s", SERVICE, "-w"]);
      return stdout.trim() || undefined;
    }
    if (b === "secret-tool") {
      const { stdout } = await exec("secret-tool", ["lookup", "service", SERVICE, "account", account]);
      return stdout.trim() || undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export async function deleteSecret(account: string): Promise<void> {
  const b = await backend();
  try {
    if (b === "macos") await exec("security", ["delete-generic-password", "-a", account, "-s", SERVICE]);
    else if (b === "secret-tool") await exec("secret-tool", ["clear", "service", SERVICE, "account", account]);
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
