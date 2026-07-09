import { MoveSchema, type Move } from "../types/index.js";

const KNOWN = new Set<string>(MoveSchema.options);

/**
 * Extract a structured move from a model's turn (DESIGN §6). Forgiving: models are asked to end a
 * turn with a `move: <MOVE>` line (optionally in a ```move fenced block), but we tolerate any
 * casing/placement and take the LAST occurrence. No move line → undefined (a plain turn).
 */
export function parseMove(content: string): Move | undefined {
  let found: Move | undefined;
  const re = /move\s*:\s*([A-Za-z_]+)/g;
  for (let m = re.exec(content); m !== null; m = re.exec(content)) {
    const candidate = m[1]!.toUpperCase();
    if (KNOWN.has(candidate)) found = candidate as Move;
  }
  return found;
}
