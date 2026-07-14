import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { isProtectedWindowsRoot, resolveProjectRoot } from "./project-root.js";

describe("project root resolution", () => {
  it("keeps a normal writable cwd", async () => {
    const root = await resolveProjectRoot({
      cwd: "/tmp/my-project",
      platform: "linux",
      homeDir: "/home/me",
      canWrite: async () => true,
    });
    expect(root).toBe(resolve("/tmp/my-project"));
  });

  it("respects QUORUM_PROJECT_ROOT", async () => {
    const root = await resolveProjectRoot({
      cwd: "C:\\Windows\\System32",
      platform: "win32",
      homeDir: "C:\\Users\\me",
      env: { QUORUM_PROJECT_ROOT: "C:\\work\\app", SystemRoot: "C:\\Windows" },
      canWrite: async () => false,
    });
    expect(root.toLowerCase()).toContain("c:\\work\\app");
  });

  it("treats Windows system folders as protected", () => {
    expect(isProtectedWindowsRoot("C:\\WINDOWS\\system32", { SystemRoot: "C:\\Windows" })).toBe(true);
    expect(isProtectedWindowsRoot("C:/Windows/System32/WindowsPowerShell/v1.0", { SystemRoot: "C:\\Windows" })).toBe(true);
    expect(isProtectedWindowsRoot("C:\\Users\\me\\project", { SystemRoot: "C:\\Windows" })).toBe(false);
  });

  it("falls back to the user home from Windows System32 and warns", async () => {
    const warnings: string[] = [];
    const root = await resolveProjectRoot({
      cwd: "C:\\Windows\\System32",
      platform: "win32",
      homeDir: "C:\\Users\\me",
      env: { SystemRoot: "C:\\Windows" },
      canWrite: async () => true,
      warn: (message) => warnings.push(message),
    });
    expect(root.toLowerCase()).toContain("c:\\users\\me");
    expect(warnings[0]).toContain("protected Windows system folder");
  });

  it("falls back to the user home when cwd is not writable", async () => {
    const warnings: string[] = [];
    const root = await resolveProjectRoot({
      cwd: "/read-only",
      platform: "linux",
      homeDir: "/home/me",
      canWrite: async () => false,
      warn: (message) => warnings.push(message),
    });
    expect(root).toBe(resolve("/home/me"));
    expect(warnings[0]).toContain("not writable");
  });
});
