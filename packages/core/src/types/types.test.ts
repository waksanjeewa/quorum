import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  TranscriptEventSchema,
  TurnResultSchema,
  parseSessionConfig,
  StageSchema,
  MoveSchema,
} from "./index.js";

const TS = "2026-07-06T10:00:00.000Z";

describe("primitives", () => {
  it("rejects unknown enum members", () => {
    expect(StageSchema.safeParse("deploy").success).toBe(false);
    expect(MoveSchema.safeParse("VETO").success).toBe(false);
    expect(StageSchema.safeParse("plan").success).toBe(true);
  });
});

describe("TranscriptEvent", () => {
  it("accepts every event variant", () => {
    const events = [
      { ts: TS, type: "turn", seat: "critic", model: "codex/gpt-5", content: "hi", move: "BLOCK" },
      { ts: TS, type: "human", content: "focus on EU first" },
      { ts: TS, type: "seat_change", seat: "critic", from: "codex", to: "gemini", reason: "usage_limit" },
      { ts: TS, type: "stage", from: "brainstorm", to: "plan", by: "models" },
      { ts: TS, type: "control", action: "stop", by: "human" },
    ];
    for (const e of events) expect(TranscriptEventSchema.safeParse(e).success).toBe(true);
  });

  it("accepts a turn with usage and no move", () => {
    const r = TranscriptEventSchema.safeParse({
      ts: TS, type: "turn", seat: "proposer", model: "claude", content: "x",
      usage: { inputTokens: 10, outputTokens: 3, costUsd: 0 },
    });
    expect(r.success).toBe(true);
  });

  it("rejects malformed events", () => {
    expect(TranscriptEventSchema.safeParse({ ts: TS, type: "turn" }).success).toBe(false); // missing fields
    expect(TranscriptEventSchema.safeParse({ ts: "nope", type: "human", content: "x" }).success).toBe(false); // bad ts
    expect(TranscriptEventSchema.safeParse({ ts: TS, type: "explode" }).success).toBe(false); // unknown type
    expect(
      TranscriptEventSchema.safeParse({ ts: TS, type: "seat_change", seat: "a", from: "b", to: "c", reason: "vibes" }).success,
    ).toBe(false); // bad reason
  });
});

describe("TurnResult", () => {
  it("accepts each status", () => {
    expect(TurnResultSchema.safeParse({ status: "ok", content: "done", move: "APPROVE" }).success).toBe(true);
    expect(TurnResultSchema.safeParse({ status: "usage_limit", detail: "5-hour limit reached" }).success).toBe(true);
    expect(TurnResultSchema.safeParse({ status: "error", detail: "boom", retryable: true }).success).toBe(true);
  });

  it("rejects malformed results", () => {
    expect(TurnResultSchema.safeParse({ status: "ok" }).success).toBe(false); // no content
    expect(TurnResultSchema.safeParse({ status: "error", detail: "x" }).success).toBe(false); // no retryable
    expect(TurnResultSchema.safeParse({ status: "weird" }).success).toBe(false);
  });
});

describe("SessionConfig (DESIGN §5 example)", () => {
  const YAML = `
seats:
  proposer:
    chain: [claude-max, openrouter/anthropic/claude-opus, ollama/llama3]
  critic:
    chain: [codex, openrouter/deepseek/deepseek-chat:free, ollama/llama3]
  arbiter:
    chain: [openrouter/google/gemini-2.5-pro, ollama/llama3]
providers:
  openrouter: { base_url: "https://openrouter.ai/api/v1", key_env: OPENROUTER_API_KEY }
  omniroute:  { base_url: "http://localhost:20128/v1",    key_env: OMNIROUTE_API_KEY }
budgets:
  max_turns_per_stage: 12
  max_cost_usd: 5.00
  wall_clock_max: 2h
`;

  it("parses the documented example and transforms snake_case → camelCase", () => {
    const cfg = parseSessionConfig(parseYaml(YAML));
    expect(Object.keys(cfg.seats)).toEqual(["proposer", "critic", "arbiter"]);
    // role defaulted from seat key
    expect(cfg.seats.proposer?.role).toBe("proposer");
    expect(cfg.seats.arbiter?.role).toBe("arbiter");
    // budgets camel-cased
    expect(cfg.budgets.maxTurnsPerStage).toBe(12);
    expect(cfg.budgets.maxCostUsd).toBe(5);
    expect(cfg.budgets.wallClockMax).toBe("2h");
    // providers camel-cased
    expect(cfg.providers.openrouter?.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(cfg.providers.openrouter?.keyEnv).toBe("OPENROUTER_API_KEY");
    // defaults
    expect(cfg.contextMode).toBe("summary_tail");
    expect(cfg.stageMode).toBe("models_decide");
  });

  it("applies defaults when optional sections are omitted", () => {
    const cfg = parseSessionConfig({
      seats: { proposer: { chain: ["ollama/llama3"] }, critic: { chain: ["ollama/llama3"] } },
    });
    expect(cfg.budgets.maxTurnsPerStage).toBe(12);
    expect(cfg.providers).toEqual({});
    expect(cfg.contextMode).toBe("summary_tail");
  });

  it("lets a seat name an explicit role that differs from its key", () => {
    const cfg = parseSessionConfig({
      seats: {
        lead: { chain: ["claude-max"], role: "proposer" },
        skeptic: { chain: ["codex"], role: "critic" },
      },
    });
    expect(cfg.seats.lead?.role).toBe("proposer");
    expect(cfg.seats.skeptic?.role).toBe("critic");
  });

  it("rejects a non-role-named seat with no explicit role", () => {
    const r = SessionConfigSafe({ seats: { lead: { chain: ["x"] }, other: { chain: ["y"] } } });
    expect(r.success).toBe(false);
  });

  it("rejects a table with fewer than 2 seats", () => {
    const r = SessionConfigSafe({ seats: { proposer: { chain: ["ollama/llama3"] } } });
    expect(r.success).toBe(false);
  });

  it("rejects an empty failover chain", () => {
    const r = SessionConfigSafe({ seats: { proposer: { chain: [] }, critic: { chain: ["x"] } } });
    expect(r.success).toBe(false);
  });
});

// local helper: safeParse without throwing
import { SessionConfigSchema } from "./index.js";
function SessionConfigSafe(raw: unknown) {
  return SessionConfigSchema.safeParse(raw);
}
