import { describe, expect, it } from "vitest";
import { parseSessionConfig } from "@quorum/core";
import { codexLiveCheckTip, completeSlash, executorIdsForLiveCheck, nextSlashSelection, renderSlashMenu, slashMenuMatches, SLASH_COMMANDS } from "./repl.js";

describe("interactive slash command menu", () => {
  it("lists all commands when only / is typed", () => {
    const matches = slashMenuMatches("/");
    expect(matches.length).toBeGreaterThan(8);
    expect(matches.map(([cmd]) => cmd)).toContain("/models");
    expect(matches.map(([cmd]) => cmd)).toContain("/frugal");
    expect(matches.map(([cmd]) => cmd)).toContain("/doctor");
  });

  it("filters commands as the user types and hides after an argument starts", () => {
    expect(slashMenuMatches("/do").map(([cmd]) => cmd)).toEqual(["/doctor"]);
    expect(slashMenuMatches("/goal build")).toEqual([]);
    expect(slashMenuMatches("plain text")).toEqual([]);
  });

  it("backs readline tab-completion with the same command list", () => {
    expect(completeSlash("/sta")[0]).toEqual(["/status"]);
    expect(completeSlash("/fru")[0]).toEqual(["/frugal"]);
    expect(completeSlash("hello")).toEqual([[], "hello"]);
    expect(completeSlash("/missing")[0]).toEqual(SLASH_COMMANDS.map(([cmd]) => cmd));
  });

  it("renders below the prompt and restores the input cursor with explicit movement", () => {
    const rendered = renderSlashMenu([["/status", "one-line session status"]], 13);
    expect(rendered.startsWith("\n")).toBe(true);
    expect(rendered).toContain("/status");
    expect(rendered).toContain("› /status");
    expect(rendered.endsWith("\x1b[1A\r\x1b[13C")).toBe(true);
    expect(rendered).not.toContain("\x1b[0J");
    expect(rendered).not.toContain("\x1b7");
    expect(rendered).not.toContain("\x1b8");
  });

  it("cycles selected slash menu rows with arrow-key direction", () => {
    expect(nextSlashSelection(0, 3, 1)).toBe(1);
    expect(nextSlashSelection(2, 3, 1)).toBe(0);
    expect(nextSlashSelection(0, 3, -1)).toBe(2);
    expect(nextSlashSelection(0, 0, 1)).toBe(0);
  });
});

describe("in-shell /doctor helpers", () => {
  it("only live-checks reachable executor-capable models", () => {
    const config = parseSessionConfig({
      seats: {
        proposer: { chain: ["openrouter/deepseek/deepseek-chat:free", "ollama/llama3"] },
        critic: { chain: ["codex", "ollama/llama3"] },
        arbiter: { chain: ["claude/opus", "codex"] },
      },
    });
    const ok = new Map([
      ["codex", true],
      ["claude/opus", false],
      ["ollama/llama3", true],
      ["openrouter/deepseek/deepseek-chat:free", true],
    ]);
    expect(executorIdsForLiveCheck(config, ok)).toEqual(["codex"]);
  });

  it("shows actionable Codex guidance for the known model/version failure", () => {
    expect(codexLiveCheckTip("codex", "newer version of Codex required")).toContain("update the Codex app");
    expect(codexLiveCheckTip("claude", "newer version of Codex required")).toBe("");
  });
});
