// Quorum benchmark (task 320): does the roundtable beat a single model on the same task?
// For each goal we produce two answers with the SAME model — one direct call vs. the full roundtable
// — then a different model judges them BLIND. Usage: `node bench/run.mjs` from the repo root.
//
// Models: contestants = Codex (your credit); judge = Claude (different model → less bias). We strip
// this shell's CLAUDE_CODE_* / ANTHROPIC_BASE_URL so the Claude SDK uses your real keychain login.
for (const k of Object.keys(process.env)) {
  if (k.startsWith("CLAUDE_CODE") || k === "CLAUDECODE" || k === "ANTHROPIC_BASE_URL" || k === "ANTHROPIC_AUTH_TOKEN") delete process.env[k];
}

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSession, parseSessionConfig, runRoundtable, readEvents, sessionFiles,
} from "@quorum/core";
import { createCodexAdapter, createClaudeAdapter } from "@quorum/adapters";

const GOALS = [
  "Recommend one programming language for a total beginner who wants a data-analytics job, and justify it in 4 sentences.",
  "Propose a caching strategy for a read-heavy REST API that serves product pages. One tight paragraph.",
];

const sig = () => new AbortController().signal;
const ctx = (goal, instructions) => ({
  seat: "x", role: "arbiter", stage: "brainstorm", turnInStage: 1,
  goal, summary: "", recentTurns: [], pendingInjections: [], roleInstructions: instructions,
});

async function singleAnswer(goal) {
  const runner = createCodexAdapter();
  const r = await runner.takeTurn(ctx(goal, "Answer the goal directly, concisely, and helpfully. No preamble."), sig());
  return r.status === "ok" ? r.content.trim() : "(single failed)";
}

async function roundtableAnswer(root, goal) {
  const config = parseSessionConfig({
    seats: { proposer: { chain: ["codex"] }, critic: { chain: ["codex"] }, arbiter: { chain: ["codex"] } },
    budgets: { max_turns_per_stage: 8 },
  });
  const session = await createSession(root, goal, config);
  const seats = { proposer: createCodexAdapter(), critic: createCodexAdapter(), arbiter: createCodexAdapter() };
  await runRoundtable({ session, seats, stages: ["brainstorm"] });
  // Prefer the converged artifact; else fall back to the last proposer turn.
  const ideas = await readFile(join(sessionFiles.artifactsDir(session.dir), "ideas.md"), "utf8").catch(() => "");
  if (ideas.trim()) return ideas.trim();
  const events = await readEvents(session.dir);
  const lastTurn = [...events].reverse().find((e) => e.type === "turn");
  return (lastTurn?.content ?? "(roundtable produced nothing)").replace(/\n?move:.*$/i, "").trim();
}

async function judge(goal, a, b) {
  const runner = createClaudeAdapter();
  const r = await runner.takeTurn(ctx(goal,
    `Two answers to a task. Score each 1-10 for quality and pick the better one. Respond with ONLY JSON: ` +
    `{"winner":"A"|"B"|"tie","scoreA":n,"scoreB":n,"reason":"..."}\n\nTASK: ${goal}\n\nANSWER A:\n${a}\n\nANSWER B:\n${b}`), sig());
  if (r.status !== "ok") return { winner: "tie", scoreA: 0, scoreB: 0, reason: "judge failed: " + (r.detail ?? "") };
  const m = r.content.slice(r.content.indexOf("{"), r.content.lastIndexOf("}") + 1);
  try { return JSON.parse(m); } catch { return { winner: "tie", scoreA: 0, scoreB: 0, reason: "unparseable: " + r.content.slice(0, 120) }; }
}

const root = await mkdtemp(join(tmpdir(), "quorum-bench-"));
const rows = [];
let rtWins = 0, singleWins = 0, ties = 0;

for (const goal of GOALS) {
  console.log("· goal:", goal.slice(0, 60));
  const single = await singleAnswer(goal);
  const rt = await roundtableAnswer(root, goal);
  // Blind: alternate which slot the roundtable takes.
  const rtIsA = rows.length % 2 === 0;
  const verdict = await judge(goal, rtIsA ? rt : single, rtIsA ? single : rt);
  const rtScore = rtIsA ? verdict.scoreA : verdict.scoreB;
  const singleScore = rtIsA ? verdict.scoreB : verdict.scoreA;
  const rtWon = verdict.winner === (rtIsA ? "A" : "B");
  const singleWon = verdict.winner === (rtIsA ? "B" : "A");
  if (rtWon) rtWins++; else if (singleWon) singleWins++; else ties++;
  rows.push({ goal, rtScore, singleScore, winner: rtWon ? "roundtable" : singleWon ? "single" : "tie", reason: verdict.reason });
  console.log(`   roundtable ${rtScore} vs single ${singleScore} → ${rows.at(-1).winner}`);
}

const table = rows.map((r, i) => `| ${i + 1} | ${r.rtScore} | ${r.singleScore} | **${r.winner}** | ${String(r.reason).replace(/\|/g, "/").slice(0, 90)} |`).join("\n");
const report = `# Benchmark: roundtable vs single model

Contestants: **Codex** (same model, both modes). Judge: **Claude** (blind, different model).
Goals: ${GOALS.length}. Roundtable = brainstorm stage, converged artifact.

**Roundtable wins ${rtWins} · single wins ${singleWins} · ties ${ties}**

| # | Roundtable score | Single score | Winner | Judge's reason |
|---|---|---|---|---|
${table}

> Small sample — a signal, not proof. Re-run \`node bench/run.mjs\` with more goals for confidence.
`;
await writeFile(new URL("./REPORT.md", import.meta.url), report, "utf8");
console.log("\n" + report);
