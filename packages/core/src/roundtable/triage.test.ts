import { describe, expect, it } from "vitest";
import { parseTriage, triage } from "./triage.js";
import type { SeatRunner } from "./engine.js";

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
  it("defaults to build if the triage model errors (never blocks real work)", async () => {
    const bad: SeatRunner = { id: "m", async takeTurn() { return { status: "error", detail: "x", retryable: false }; } };
    expect((await triage(bad, "anything")).intent).toBe("build");
  });
});
