import { createInterface, type Interface as Readline } from "node:readline";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { QuorumHttpServer, loadConfig, doctorReport, buildTriageRunner } from "@quorum/daemon";
import { triage, quickTriage, parseSessionConfig } from "@quorum/core";
import { renderDashboard } from "@quorum/dashboard";
import { formatEvent } from "./format.js";
import { runSetup } from "./setup.js";
import { resolveSecretsEnv, knownKeyEnvs } from "./keychain.js";
import { C, PROMPT, banner } from "./theme.js";
import type { RunningSession } from "@quorum/daemon";

const HELP = `${C.bold("Commands")} ${C.dim("(type a goal to build; while running, type to send a message to the table)")}
  ${C.brand("/models")}          pick your models — login or paste an API key
  ${C.brand("/doctor")}          check which model seats are ready
  ${C.brand("/agents")}          show the seats, what they're doing, and elapsed time
  ${C.brand("/status")}          one-line session status
  ${C.brand("/pause")} ${C.brand("/resume")}   pause / resume the running session
  ${C.brand("/stop")}            stop the running session (kill switch)
  ${C.brand("/config")}          show where your config lives
  ${C.brand("/help")}            this help
  ${C.brand("/exit")}            leave quorum`;

const fmtElapsed = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

/** The interactive Quorum shell: stay inside `quorum`, drive it with `/` commands. */
export async function repl(projectRoot: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: PROMPT });
  let server: QuorumHttpServer | undefined;
  let session: RunningSession | undefined;
  let running = false;
  let interrupts = 0;
  let closed = false;
  let lastEventAt = 0;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const printAbove = (text: string): void => {
    process.stdout.write("\r\x1b[K" + text + "\n");
    if (!closed) rl.prompt(true);
  };
  const info = (text: string): void => printAbove(`\x1b[2m${text}\x1b[0m`);

  console.log(
    "\n" +
      banner([
        `${C.brand("◆")} ${C.bold("Quorum")} ${C.dim("— multiple AI models plan and build together")}`,
        `${C.dim("your session never dies · you're always at the table")}`,
      ]) +
      "\n",
  );
  console.log(HELP + "\n");

  // Model setup is mandatory — if there's no config, go straight into it.
  let hasConfig = true;
  try {
    await access(join(projectRoot, ".quorum", "config.yaml"));
  } catch {
    hasConfig = false;
  }
  if (!hasConfig) {
    console.log(C.dim("No models configured yet — let's pick them.\n"));
    rl.pause();
    await runSetup(projectRoot, rl);
    rl.resume();
  }
  rl.prompt();

  const startGoal = async (goal: string): Promise<void> => {
    const config = await loadConfig(projectRoot);
    const env = await resolveSecretsEnv(knownKeyEnvs(config));

    // Triage: don't convene a roundtable for a greeting / small talk / a quick question.
    // Obvious cases are instant (no model call); only ambiguous input costs a model turn.
    let decision = quickTriage(goal);
    if (!decision) {
      const triageRunner = buildTriageRunner(config, { env });
      if (triageRunner) {
        info("thinking…");
        decision = await triage(triageRunner, goal);
      }
    }
    if (decision?.intent === "chat") {
      printAbove(`  ${C.cyan(decision.reply ?? "Hi!")}`);
      return;
    }

    if (server) await server.close();
    info("✱ convening the roundtable — proposer · critic · arbiter…");
    server = new QuorumHttpServer({ projectRoot, renderDashboard, autonomous: true, env });
    const listen = await server.listen();
    session = await server.daemon.createSession(goal, config);
    running = true;
    lastEventAt = Date.now();
    info(`session ${session.id} started · dashboard ${listen.url}`);
    session.subscribe((e) => {
      lastEventAt = Date.now();
      printAbove(formatEvent(e));
    });

    // Heartbeat: while a model is mid-turn (no events for a while), show that work is happening.
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = setInterval(() => {
      if (!running || !session) return;
      if (Date.now() - lastEventAt < 7000) return; // events are flowing — stay quiet
      const s = session.status();
      if (s.state !== "running") return;
      const task = s.currentTask ? ` · building task ${s.currentTask}` : "";
      info(`⏳ still working — stage ${s.stage} · ${s.turns} turns · ${fmtElapsed(s.elapsedMs)}${task} (models think for a while; /agents for detail)`);
    }, 8000);

    void session.wait().then(() => {
      running = false;
      if (heartbeat) clearInterval(heartbeat);
      const s = session?.status();
      printAbove(`\x1b[1m✓ done\x1b[0m \x1b[2m(${s?.stage}, ${s?.turns} turns${s?.converged ? ", converged" : ""}, ${fmtElapsed(s?.elapsedMs ?? 0)})\x1b[0m`);
    });
  };

  const handle = async (raw: string): Promise<void> => {
    const text = raw.trim();
    if (text === "") return;
    interrupts = 0;

    if (text.startsWith("/")) {
      const [cmd, ...rest] = text.slice(1).split(/\s+/);
      switch (cmd) {
        case "models":
        case "setup":
          rl.pause();
          await runSetup(projectRoot, rl);
          rl.resume();
          return;
        case "doctor": {
          const config = await loadConfig(projectRoot);
          const report = await doctorReport(config);
          console.log(C.bold("\n  Your seats:"));
          for (const [seat, s] of Object.entries(config.seats)) {
            const models = s.chain.map((m) => (m === "claude" || m === "codex" ? `${m} ${C.dim("(account default)")}` : m)).join(C.dim(" → "));
            console.log(`    ${C.cyan(seat.padEnd(9))} ${models}`);
          }
          console.log(C.bold("\n  Models in use:"));
          for (const c of report) console.log(`    ${c.ok ? C.green("✓") : C.red("✗")} ${c.id} ${C.dim(c.detail)}`);
          // Which logged-in models aren't in the config yet?
          const inUse = new Set(report.map((c) => c.id.split("/")[0]));
          const detected = await doctorReport(
            parseSessionConfig({ seats: { proposer: { chain: ["claude"] }, critic: { chain: ["codex"] }, arbiter: { chain: ["ollama/llama3"] } } }),
          ).catch(() => []);
          const extra = detected.filter((d) => d.ok && !inUse.has(d.id.split("/")[0]));
          if (extra.length) console.log(C.dim(`\n  Also logged in (not in your config): ${extra.map((e) => e.id).join(", ")} — add with /models`));
          const unique = new Set(Object.values(config.seats).flatMap((s) => s.chain));
          if (unique.size === 1) console.log(C.dim(`  All seats use one model — /models to add others for real multi-model debate.`));
          return;
        }
        case "status": {
          if (!session) return void console.log("  No session yet — type a goal to start.");
          const s = session.status();
          console.log(`  ${C.bold(s.state)} · stage ${s.stage} · ${s.turns} turns · ${fmtElapsed(s.elapsedMs)}${s.currentTask ? ` · task ${s.currentTask}` : ""}`);
          return;
        }
        case "agents": {
          if (!session) return void console.log("  No session yet — type a goal to start.");
          const s = session.status();
          console.log(`\n  ${C.bold("Session")} ${s.id}  ${C.dim(`· ${s.state} · stage ${s.stage} · ${fmtElapsed(s.elapsedMs)}`)}`);
          if (s.currentTask) console.log(`  ${C.brand("▶")} building task ${C.bold(s.currentTask)}`);
          console.log(`  ${C.bold("Seats")}:`);
          for (const [name, seat] of Object.entries(s.seats)) {
            console.log(`    ${C.cyan(name.padEnd(9))} ${seat.model}${seat.paused ? C.dim(" (paused)") : ""}`);
          }
          console.log("");
          return;
        }
        case "pause":
          session?.pause();
          info("paused");
          return;
        case "resume":
          session?.resume();
          info("resumed");
          return;
        case "stop":
          await session?.stop();
          running = false;
          info("stopped");
          return;
        case "config":
          console.log(`  ${join(projectRoot, ".quorum", "config.yaml")}`);
          return;
        case "help":
          console.log(HELP);
          return;
        case "exit":
        case "quit":
          closed = true;
          rl.close();
          return;
        default:
          console.log(`  Unknown command: /${cmd}  (try /help)`);
          return;
      }
    }

    // Plain text: inject while running, otherwise treat as a new goal.
    if (running && session) {
      await session.inject(text);
      info("(your message will reach the table next turn)");
    } else {
      await startGoal(text);
    }
  };

  rl.on("line", (raw) => {
    void handle(raw)
      .catch((err) => printAbove(`\x1b[31merror:\x1b[0m ${String(err instanceof Error ? err.message : err)}`))
      .finally(() => {
        if (!closed) rl.prompt();
      });
  });

  rl.on("SIGINT", () => {
    if (running && session) {
      void session.stop();
      running = false;
      printAbove("stopped (Ctrl+C). Type a goal or /exit.");
    } else if (interrupts === 0) {
      interrupts = 1;
      printAbove("Press Ctrl+C again or type /exit to leave.");
    } else {
      closed = true;
      rl.close();
    }
  });

  await new Promise<void>((resolve) => rl.on("close", () => { closed = true; resolve(); }));
  if (heartbeat) clearInterval(heartbeat);
  if (server) await server.close();
  console.log("\nBye.");
}
