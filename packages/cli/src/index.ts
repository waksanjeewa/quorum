#!/usr/bin/env node
import { writeFile, mkdir, access } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { QuorumHttpServer, loadConfig, doctorReport, DEFAULT_CONFIG_YAML } from "@quorum/daemon";
import { renderDashboard } from "@quorum/dashboard";
import { requireClient } from "./client.js";
import { control, inject, listSessions, statusOf, streamEvents } from "./commands.js";
import { formatEvent } from "./format.js";
import { repl } from "./repl.js";
import { runSetup } from "./setup.js";
import { resolveSecretsEnv } from "./keychain.js";

const HELP = `Quorum — multiple AI models collaborate on one goal.

Usage:
  quorum                    Enter the interactive shell (recommended)
  quorum setup              Pick your models (login or paste an API key)
  quorum init               Scaffold a starter .quorum/config.yaml here
  quorum doctor             Check which model seats are logged in / reachable
  quorum start "<goal>"     Deliberate → plan → build (autonomous; needs a git repo to execute)
  quorum status             Show all sessions
  quorum inject "<msg>"     Send a message into the latest session (without stopping it)
  quorum pause | resume     Pause / resume the latest session
  quorum stop               Stop the latest session (kill switch)
  quorum attach [id]        Stream a running session's transcript (Ctrl+C detaches, does not stop)
`;

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  const projectRoot = process.cwd();

  if (!cmd) return repl(projectRoot); // no args → interactive shell

  switch (cmd) {
    case "init":
      return init(projectRoot);
    case "setup":
    case "models": {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      await runSetup(projectRoot, rl);
      rl.close();
      return;
    }
    case "doctor":
      return doctor(projectRoot);
    case "start":
      return start(projectRoot, args.join(" ") || "Untitled goal");
    case "status": {
      const client = await requireClient(projectRoot);
      const sessions = await listSessions(client);
      if (sessions.length === 0) console.log("No sessions.");
      for (const s of sessions) {
        console.log(`${s.id}  [${s.state}]  stage=${s.stage}  turns=${s.turns}  converged=${s.converged}`);
        for (const [seat, info] of Object.entries(s.seats)) console.log(`    ${seat}: ${info.model}${info.paused ? " (paused)" : ""}`);
      }
      return;
    }
    case "inject": {
      const client = await requireClient(projectRoot);
      await inject(client, args.join(" "));
      console.log("Injected.");
      return;
    }
    case "pause":
    case "resume":
    case "stop": {
      const client = await requireClient(projectRoot);
      const s = await control(client, cmd);
      console.log(`${cmd} → ${s.state}`);
      return;
    }
    case "attach": {
      const client = await requireClient(projectRoot);
      const id = args[0] ?? (await listSessions(client)).at(-1)?.id;
      if (!id) return console.log("No sessions to attach to.");
      const ctrl = new AbortController();
      process.on("SIGINT", () => ctrl.abort());
      try {
        for await (const e of streamEvents(client, id, ctrl.signal)) console.log(formatEvent(e));
      } catch {
        /* detached */
      }
      return;
    }
    default:
      console.log(HELP);
  }
}

const STARTER_CONFIG = `# Quorum config — each seat is a failover chain, tried in order.
# claude / codex reuse your existing subscription logins (run \`claude login\` / \`codex login\`).
# <provider>/<model> uses the OpenAI-compatible client (OpenRouter, a local gateway, or a direct API).
# ollama/<model> is the never-offline free local fallback (needs \`ollama serve\`).
seats:
  proposer:
    chain: [claude, openrouter/deepseek/deepseek-chat:free, ollama/llama3]
  critic:
    chain: [codex, openrouter/deepseek/deepseek-chat:free, ollama/llama3]
  arbiter:
    chain: [openrouter/google/gemini-2.5-pro, ollama/llama3]
budgets:
  max_turns_per_stage: 12
  max_cost_usd: 5.0
providers:
  openrouter:
    base_url: "https://openrouter.ai/api/v1"
    key_env: OPENROUTER_API_KEY   # export this to use OpenRouter
`;

async function init(projectRoot: string): Promise<void> {
  const dir = join(projectRoot, ".quorum");
  const path = join(dir, "config.yaml");
  try {
    await access(path);
    console.log(`.quorum/config.yaml already exists — leaving it untouched.`);
    return;
  } catch {
    /* not present — create it */
  }
  await mkdir(dir, { recursive: true });
  await writeFile(path, STARTER_CONFIG, "utf8");
  console.log(`Wrote .quorum/config.yaml. Edit the seat chains, then run:  quorum doctor`);
  void DEFAULT_CONFIG_YAML;
}

async function doctor(projectRoot: string): Promise<void> {
  const config = await loadConfig(projectRoot);
  console.log("Checking configured models…\n");
  const checks = await doctorReport(config);
  const ok = new Map(checks.map((c) => [c.id, c.ok]));
  for (const c of checks) {
    const mark = c.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    const exec = c.canExecute ? " \x1b[2m(can execute)\x1b[0m" : "";
    console.log(`  ${mark} ${c.id}${exec}\n      ${c.detail}`);
  }

  // A seat is "fillable" if any model in its failover chain is reachable.
  const seats = Object.entries(config.seats);
  const fillable = seats.filter(([, s]) => s.chain.some((m) => ok.get(m)));
  const canExecute = checks.some((c) => c.ok && c.canExecute);

  console.log(`\n\x1b[1mSeats\x1b[0m (${seats.length}):`);
  for (const [name, s] of seats) {
    const first = s.chain.find((m) => ok.get(m));
    const mark = first ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`  ${mark} ${name.padEnd(9)} → ${first ?? "no reachable model in chain"}`);
  }

  console.log("");
  if (fillable.length < 2) {
    console.log(`Only ${fillable.length}/${seats.length} seats can be filled — you need at least 2. Add a reachable model to a seat's chain (see .quorum/config.yaml) or run \`quorum init\`.`);
  } else {
    console.log(`${fillable.length}/${seats.length} seats ready.` + (canExecute ? "" : " No executor model (claude/codex) — you can plan but not build; add one to enable autonomous building."));
    console.log(`Run:  quorum start "<your goal>"`);
  }
}

async function start(projectRoot: string, goal: string): Promise<void> {
  const config = await loadConfig(projectRoot);
  const env = await resolveSecretsEnv(Object.values(config.providers).map((p) => p.keyEnv));
  const server = new QuorumHttpServer({ projectRoot, renderDashboard, autonomous: true, env });
  const info = await server.listen();
  const running = await server.daemon.createSession(goal, config);

  console.log(`\n  Quorum session \x1b[1m${running.id}\x1b[0m started`);
  console.log(`  Dashboard/API: ${info.url}`);
  console.log(`  Autonomous: deliberate → plan → build (needs a git repo to execute).`);
  console.log(`  Ctrl+C stops the session.\n`);

  running.subscribe((e) => console.log(formatEvent(e)));

  let stopping = false;
  const shutdown = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    console.log("\nStopping…");
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());

  const result = await running.wait();
  console.log(`\n  Session ${result?.stoppedReason ?? "ended"} — stages: ${result?.stagesCompleted.join(", ") || "none"}`);
  await server.close();
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
