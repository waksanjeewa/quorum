import { describe, expect, it } from "vitest";
import { OllamaAdapter } from "../ollama/ollama-adapter.js";
import { HttpAdapter } from "../http/http-adapter.js";
import { MockAdapter } from "../mock/mock-adapter.js";
import { createClaudeAdapter, claudeQueryOptions } from "../claude/claude-adapter.js";
import { createCodexAdapter, codexThreadOptions } from "../codex/codex-adapter.js";

const okClient = { async run() { return { text: "ok" }; } };
const noAuth = async () => ({ ok: true, detail: "" });

describe("canExecute capability", () => {
  it("is true only for the executor-capable agents (claude, codex)", () => {
    expect(createClaudeAdapter({ client: okClient, authCheck: noAuth }).capabilities().canExecute).toBe(true);
    expect(createCodexAdapter({ client: okClient, authCheck: noAuth, probeQuota: async () => ({}) }).capabilities().canExecute).toBe(true);
    expect(new OllamaAdapter({ model: "llama3" }).capabilities().canExecute).toBe(false);
    expect(new HttpAdapter({ id: "x", baseUrl: "http://h/v1", model: "m", apiKey: "k" }).capabilities().canExecute).toBe(false);
    expect(new MockAdapter().capabilities().canExecute).toBe(false);
  });
});

describe("claudeQueryOptions", () => {
  it("disables tools for deliberation", () => {
    const o = claudeQueryOptions("sys", undefined, undefined, undefined);
    expect(o["allowedTools"]).toEqual([]);
    expect(o["cwd"]).toBeUndefined();
  });
  it("enables tools + sets cwd for execute mode", () => {
    const o = claudeQueryOptions("sys", "sess", "opus", { workingDirectory: "/wt/010" });
    expect(o["allowedTools"]).toContain("Edit");
    expect(o["allowedTools"]).not.toContain("Task"); // no subagents unless asked
    expect(o["cwd"]).toBe("/wt/010");
    expect(o["permissionMode"]).toBe("acceptEdits");
    expect(o["resume"]).toBe("sess");
  });
  it("grants the Task tool (subagents) when execute.subagents is on", () => {
    const o = claudeQueryOptions("sys", undefined, undefined, { workingDirectory: "/wt/010", subagents: true });
    expect(o["allowedTools"]).toContain("Task");
    expect(o["allowedTools"]).toContain("Edit");
  });
});

describe("codexThreadOptions", () => {
  it("read-only for deliberation, workspace-write + cwd for execute", () => {
    expect(codexThreadOptions(undefined, undefined)).toMatchObject({ skipGitRepoCheck: true, sandboxMode: "read-only" });
    const e = codexThreadOptions("gpt-5", { workingDirectory: "/wt/020" });
    expect(e).toMatchObject({ sandboxMode: "workspace-write", workingDirectory: "/wt/020", model: "gpt-5", skipGitRepoCheck: true });
  });
});
