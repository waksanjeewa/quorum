import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { parseSessionConfig, type SessionConfig } from "@quorum/core";

/** Default free/local config: a 3-seat table on local Ollama. Works with zero API keys. */
export const DEFAULT_CONFIG_YAML = `seats:
  proposer:
    chain: [ollama/llama3]
  critic:
    chain: [ollama/llama3]
  arbiter:
    chain: [ollama/llama3]
budgets:
  max_turns_per_stage: 12
`;

/** Load .quorum/config.yaml if present, otherwise the local-Ollama default. */
export async function loadConfig(projectRoot: string): Promise<SessionConfig> {
  const path = join(projectRoot, ".quorum", "config.yaml");
  try {
    const raw = await readFile(path, "utf8");
    return parseSessionConfig(parseYaml(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return parseSessionConfig(parseYaml(DEFAULT_CONFIG_YAML));
    }
    throw err;
  }
}
