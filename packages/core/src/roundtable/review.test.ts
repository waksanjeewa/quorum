import { describe, expect, it } from "vitest";
import { parseReview, reviewDiff } from "./review.js";
import type { SeatRunner } from "./engine.js";

const runner = (content: string): SeatRunner => ({ id: "r", async takeTurn() { return { status: "ok", content }; } });
const input = { taskId: "001", title: "add feature", diff: "+ hello", acceptancePassed: true };

describe("parseReview", () => {
  it("APPROVE approves", () => expect(parseReview("APPROVE", true).approved).toBe(true));
  it("BLOCK captures the reason", () => {
    const r = parseReview("BLOCK: leaks a secret in logs", true);
    expect(r.approved).toBe(false);
    expect(r.reason).toContain("secret");
  });
  it("ambiguous output falls back to the acceptance gate", () => {
    expect(parseReview("hmm not sure", true).approved).toBe(true);
    expect(parseReview("hmm not sure", false).approved).toBe(false);
  });
});

describe("reviewDiff", () => {
  it("blocks a bad diff even when acceptance passed", async () => {
    const r = await reviewDiff(runner("BLOCK: SQL injection in the query builder"), input);
    expect(r.approved).toBe(false);
    expect(r.reason).toContain("SQL");
  });
  it("approves a clean diff", async () => {
    expect((await reviewDiff(runner("APPROVE"), input)).approved).toBe(true);
  });
  it("defers to acceptance if the reviewer errors", async () => {
    const bad: SeatRunner = { id: "r", async takeTurn() { return { status: "error", detail: "x", retryable: false }; } };
    expect((await reviewDiff(bad, input)).approved).toBe(true);
    expect((await reviewDiff(bad, { ...input, acceptancePassed: false })).approved).toBe(false);
  });
});
