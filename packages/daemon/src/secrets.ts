import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";

const exec = promisify(execFile);
const SERVICE = "quorum";

/**
 * Secure API-key storage — credentials never live in files (a core Quorum principle):
 *  • macOS  → Keychain (`security`)
 *  • Linux  → libsecret (`secret-tool`), if installed
 *  • else   → env vars only (not persisted)
 * Keys are stored under account = the env-var name (e.g. OPENROUTER_API_KEY).
 */
type Backend = "macos" | "secret-tool" | "none";
let cached: Backend | undefined;

async function backend(): Promise<Backend> {
  if (cached) return cached;
  if (platform() === "darwin") return (cached = "macos");
  if (platform() === "linux") {
    const ok = await exec("secret-tool", ["--version"]).then(() => true).catch(() => false);
    return (cached = ok ? "secret-tool" : "none");
  }
  return (cached = "none");
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
    if (b === "macos") return (await exec("security", ["find-generic-password", "-a", account, "-s", SERVICE, "-w"])).stdout.trim() || undefined;
    if (b === "secret-tool") return (await exec("secret-tool", ["lookup", "service", SERVICE, "account", account])).stdout.trim() || undefined;
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
  const builtin = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY", "TOGETHER_API_KEY", "FIREWORKS_API_KEY", "DEEPINFRA_API_KEY", "GITHUB_TOKEN"];
  return [...new Set([...builtin, ...Object.values(config.providers).map((p) => p.keyEnv)])];
}

/** process.env with stored Keychain secrets layered under the given names (real env wins). */
export async function resolveSecretsEnv(keyEnvNames: string[]): Promise<Record<string, string | undefined>> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const name of keyEnvNames) {
    if (env[name]) continue;
    const stored = await getSecret(name);
    if (stored) env[name] = stored;
  }
  return env;
}
