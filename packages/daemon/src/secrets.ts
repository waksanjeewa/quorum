import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";

const exec = promisify(execFile);
const SERVICE = "quorum";

/**
 * Secure API-key storage — credentials never live in files (a core Quorum principle):
 *  • macOS  → Keychain (`security`)
 *  • Linux  → libsecret (`secret-tool`), if installed
 *  • Windows → Credential Manager (via PowerShell + DPAPI-backed Windows APIs)
 *  • else   → env vars only (not persisted)
 * Keys are stored under account = the env-var name (e.g. OPENROUTER_API_KEY).
 */
type Backend = "macos" | "secret-tool" | "windows" | "none";
let cached: Backend | undefined;
const windowsTarget = (account: string): string => `${SERVICE}:${account}`;

const WINDOWS_CREDMAN_PREAMBLE = String.raw`
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

public static class QuorumCredMan {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public UInt32 Flags;
    public UInt32 Type;
    public string TargetName;
    public string Comment;
    public FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, UInt32 type, Int32 reservedFlag, out IntPtr credentialPtr);

  [DllImport("advapi32.dll", SetLastError = true)]
  public static extern void CredFree(IntPtr buffer);

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredWrite(ref CREDENTIAL userCredential, UInt32 flags);

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredDelete(string target, UInt32 type, Int32 flags);
}
"@
`;

function powershellExe(): string {
  return process.env["QUORUM_POWERSHELL"] || (platform() === "win32" ? "powershell.exe" : "pwsh");
}

function execPowerShell(script: string, args: string[], stdin?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      powershellExe(),
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script, ...args],
      { maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => (err ? reject(new Error(String(stderr || err.message))) : resolve(String(stdout))),
    );
    child.stdin?.end(stdin);
  });
}

async function backend(): Promise<Backend> {
  if (cached) return cached;
  if (platform() === "darwin") return (cached = "macos");
  if (platform() === "win32") return (cached = "windows");
  if (platform() === "linux") {
    const ok = await exec("secret-tool", ["--version"]).then(() => true).catch(() => false);
    return (cached = ok ? "secret-tool" : "none");
  }
  return (cached = "none");
}

export function keychainAvailable(): boolean {
  return platform() === "darwin" || platform() === "linux" || platform() === "win32";
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
  if (b === "windows") {
    await execPowerShell(
      WINDOWS_CREDMAN_PREAMBLE +
        String.raw`
$target = $args[0]
$account = $args[1]
$secret = [Console]::In.ReadToEnd()
$bytes = [Text.Encoding]::Unicode.GetBytes($secret)
$blob = [Runtime.InteropServices.Marshal]::AllocCoTaskMem($bytes.Length)
try {
  [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $blob, $bytes.Length)
  $cred = New-Object QuorumCredMan+CREDENTIAL
  $cred.Type = 1
  $cred.TargetName = $target
  $cred.UserName = $account
  $cred.CredentialBlobSize = $bytes.Length
  $cred.CredentialBlob = $blob
  $cred.Persist = 2
  if (-not [QuorumCredMan]::CredWrite([ref]$cred, 0)) {
    throw "CredWrite failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
  }
} finally {
  [Runtime.InteropServices.Marshal]::FreeCoTaskMem($blob)
}
`,
      [windowsTarget(account), account],
      secret,
    );
    return true;
  }
  return false;
}

export async function getSecret(account: string): Promise<string | undefined> {
  const b = await backend();
  try {
    if (b === "macos") return (await exec("security", ["find-generic-password", "-a", account, "-s", SERVICE, "-w"])).stdout.trim() || undefined;
    if (b === "secret-tool") return (await exec("secret-tool", ["lookup", "service", SERVICE, "account", account])).stdout.trim() || undefined;
    if (b === "windows") {
      return (
        await execPowerShell(
          WINDOWS_CREDMAN_PREAMBLE +
            String.raw`
$target = $args[0]
$ptr = [IntPtr]::Zero
if (-not [QuorumCredMan]::CredRead($target, 1, 0, [ref]$ptr)) {
  exit 2
}
try {
  $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][QuorumCredMan+CREDENTIAL])
  if ($cred.CredentialBlobSize -eq 0) { exit 0 }
  [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringUni($cred.CredentialBlob, [int]($cred.CredentialBlobSize / 2)))
} finally {
  [QuorumCredMan]::CredFree($ptr)
}
`,
          [windowsTarget(account)],
        )
      ).trim() || undefined;
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
    else if (b === "windows") {
      await execPowerShell(
        WINDOWS_CREDMAN_PREAMBLE +
          String.raw`
$target = $args[0]
if (-not [QuorumCredMan]::CredDelete($target, 1, 0)) {
  $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  if ($code -ne 1168) { throw "CredDelete failed: $code" }
}
`,
        [windowsTarget(account)],
      );
    }
  } catch {
    /* not present */
  }
}

/** Env-var names to look up in the OS credential store: built-in direct providers + any from config. */
export function knownKeyEnvs(config: { providers: Record<string, { keyEnv: string }> }): string[] {
  const builtin = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY", "TOGETHER_API_KEY", "FIREWORKS_API_KEY", "DEEPINFRA_API_KEY", "GITHUB_TOKEN"];
  return [...new Set([...builtin, ...Object.values(config.providers).map((p) => p.keyEnv)])];
}

/** process.env with stored credential-store secrets layered under the given names (real env wins). */
export async function resolveSecretsEnv(keyEnvNames: string[]): Promise<Record<string, string | undefined>> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const name of keyEnvNames) {
    if (env[name]) continue;
    const stored = await getSecret(name);
    if (stored) env[name] = stored;
  }
  return env;
}
