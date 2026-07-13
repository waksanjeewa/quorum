import { describe, expect, it } from "vitest";
import { isIncompleteGoal, parseTriage, quickTriage, triage } from "./triage.js";
import type { SeatRunner } from "./engine.js";

describe("quickTriage (instant, no model call)", () => {
  it("answers greetings and thanks instantly as chat", () => {
    for (const g of ["hi", "hey", "hello!", "thanks", "thank you", "gm", "ok"]) {
      expect(quickTriage(g)?.intent).toBe("chat");
    }
  });
  it("routes obvious build commands straight to build", () => {
    for (const g of ["build a CLI", "create a script", "fix the login bug", "refactor the parser", "add a dashboard session list"]) {
      expect(quickTriage(g)?.intent).toBe("build");
    }
  });
  it("asks a follow-up for incomplete or vague goal fragments", () => {
    for (const g of ["build", "build me a", "fix this", "make app", "add feature", "not working"]) {
      expect(isIncompleteGoal(g)).toBe(true);
      expect(quickTriage(g)?.intent).toBe("clarify");
      expect(quickTriage(g)?.reply).toContain("What should");
    }
  });
  it("returns null for ambiguous input (needs a model)", () => {
    expect(quickTriage("what can you do?")).toBeNull();
    expect(quickTriage("the tests are flaky")).toBeNull();
  });
  it("flags questions about Quorum's own config as meta (answered from local state)", () => {
    for (const q of ["what models are we using now?", "which models are configured?", "show my config", "what are my seats?", "what settings do we have", "am I logged in?", "what API do I have?", "is my openrouter key set up?"]) {
      expect(quickTriage(q)?.intent).toBe("meta");
    }
  });
  it("does not mistake build goals that mention config words for meta", () => {
    expect(quickTriage("build a settings page")?.intent).toBe("build");
    expect(quickTriage("add a model picker to the app")?.intent).toBe("build");
  });
});

const runner = (content: string): SeatRunner => ({ id: "m", async takeTurn() { return { status: "ok", content }; } });

describe("parseTriage", () => {
  it("treats exactly BUILD as a build goal", () => {
    expect(parseTriage("BUILD").intent).toBe("build");
    expect(parseTriage("  build  ").intent).toBe("build");
  });
  it("treats a conversational response as chat and keeps the reply", () => {
    const r = parseTriage("Hey! I'm Quorum — tell me what to build.");
    expect(r.intent).toBe("chat");
    expect(r.reply).toContain("Quorum");
  });
  it("does not mistake a chat reply that merely starts with 'build' for a build goal", () => {
    expect(parseTriage("Building things is my specialty — what do you have in mind?").intent).toBe("chat");
  });
  it("recognizes a META classification (a question about Quorum's setup)", () => {
    expect(parseTriage("META").intent).toBe("meta");
    expect(parseTriage("meta").intent).toBe("meta");
  });
  it("recognizes a CLARIFY classification and keeps the question", () => {
    const r = parseTriage("CLARIFY: Which app should I change?");
    expect(r.intent).toBe("clarify");
    expect(r.reply).toBe("Which app should I change?");
  });
});

describe("triage", () => {
  it("classifies a real goal as build", async () => {
    expect((await triage(runner("BUILD"), "make a CLI that adds numbers")).intent).toBe("build");
  });
  it("classifies a greeting as chat with a reply", async () => {
    const r = await triage(runner("Hi there! What would you like to build today?"), "hi");
    expect(r.intent).toBe("chat");
    expect(r.reply).toBeTruthy();
  });
  it("asks for clarification if the triage model errors on ambiguous input", async () => {
    const bad: SeatRunner = { id: "m", async takeTurn() { return { status: "error", detail: "x", retryable: false }; } };
    const r = await triage(bad, "anything");
    expect(r.intent).toBe("clarify");
    expect(r.reply).toContain("What should");
  });
});
