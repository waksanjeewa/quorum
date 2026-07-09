import { z } from "zod";
import { RoleSchema, type Role, type SeatId } from "./primitives.js";

/**
 * Internal, validated session configuration (SPEC §3). Camel-cased.
 * Produced by parsing the human-authored YAML (snake_case, DESIGN §5) via SessionConfigSchema.
 */
export interface SeatConfig {
  /** Failover chain: ordered model ids, e.g. ["claude-max", "openrouter/…:free", "ollama/llama3"]. */
  chain: string[];
  role: Role;
  /** Per-seat MCP config, passed through to adapters that support it. Opaque here. */
  mcp?: unknown;
}

export interface Budgets {
  maxTurnsPerStage: number;
  maxCostUsd?: number;
  /** Duration string, e.g. "2h", "90m". Parsed by the daemon. */
  wallClockMax?: string;
}

/** A named HTTP provider/gateway for the generic OpenAI-compatible adapter (DESIGN §11b). */
export interface ProviderConfig {
  baseUrl: string;
  /** Env var holding the API key. Keys never live in config files (DESIGN §1). */
  keyEnv: string;
}

export interface SessionConfig {
  seats: Record<SeatId, SeatConfig>;
  contextMode: "full" | "summary_tail";
  stageMode: "fixed" | "models_decide";
  budgets: Budgets;
  providers: Record<string, ProviderConfig>;
}

// ---- External YAML shape (snake_case, human-authored) → internal (camelCase) ----

const ExternalBudgets = z
  .object({
    max_turns_per_stage: z.number().int().positive().default(12),
    max_cost_usd: z.number().positive().optional(),
    wall_clock_max: z.string().optional(),
  })
  .transform((b): Budgets => ({
    maxTurnsPerStage: b.max_turns_per_stage,
    ...(b.max_cost_usd !== undefined ? { maxCostUsd: b.max_cost_usd } : {}),
    ...(b.wall_clock_max !== undefined ? { wallClockMax: b.wall_clock_max } : {}),
  }));

const ExternalProvider = z
  .object({ base_url: z.string().url(), key_env: z.string().min(1) })
  .transform((p): ProviderConfig => ({ baseUrl: p.base_url, keyEnv: p.key_env }));

const ExternalSeat = z.object({
  chain: z.array(z.string().min(1)).min(1),
  role: RoleSchema.optional(),
  mcp: z.unknown().optional(),
});

/**
 * Parses `.quorum/config.yaml`. Seat `role` defaults to the seat's key when that key is a
 * valid role (matches the DESIGN §5 example where seat names *are* the roles).
 */
export const SessionConfigSchema = z
  .object({
    seats: z.record(z.string().min(1), ExternalSeat),
    context_mode: z.enum(["full", "summary_tail"]).default("summary_tail"),
    stage_mode: z.enum(["fixed", "models_decide"]).default("models_decide"),
    budgets: ExternalBudgets.default({ max_turns_per_stage: 12 }),
    providers: z.record(z.string(), ExternalProvider).default({}),
  })
  .transform((cfg, ctx): SessionConfig => {
    const seats: Record<SeatId, SeatConfig> = {};
    for (const [id, seat] of Object.entries(cfg.seats)) {
      const roleFromKey = RoleSchema.safeParse(id);
      const role = seat.role ?? (roleFromKey.success ? roleFromKey.data : undefined);
      if (role === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["seats", id, "role"],
          message: `seat "${id}" needs a role (or name the seat proposer/critic/arbiter)`,
        });
        continue;
      }
      seats[id] = {
        chain: seat.chain,
        role,
        ...(seat.mcp !== undefined ? { mcp: seat.mcp } : {}),
      };
    }
    return {
      seats,
      contextMode: cfg.context_mode,
      stageMode: cfg.stage_mode,
      budgets: cfg.budgets,
      providers: cfg.providers,
    };
  })
  .superRefine((cfg, ctx) => {
    if (Object.keys(cfg.seats).length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["seats"],
        message: "a roundtable needs at least 2 seats",
      });
    }
  });

/** Parse a raw (YAML-decoded) object into a validated SessionConfig, or throw with details. */
export function parseSessionConfig(raw: unknown): SessionConfig {
  return SessionConfigSchema.parse(raw);
}
