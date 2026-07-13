import { createInterface, type Interface as Readline } from "node:readline";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { QuorumHttpServer, loadConfig, doctorReport, buildTriageRunner } from "@quorum/daemon";
import { triage, quickTriage, parseSessionConfig } from "@quorum/core";
import { renderDashboard } from "@quorum/dashboard";
import { formatEvent } from "./format.js";
import { runSetup } from "./setup.js";
import { resolveSecretsEnv, knownKeyEnvs } from "./keychain.js";
import { C, PROMPT, quorumLogo } from "./theme.js";
import type { RunningSession } from "@quorum/daemon";

const HELP = `${C.bold("Commands")} ${C.dim("(type a goal to build; while running, type to send a message to the table)")}
  ${C.brand("/models")}          pick your models — login or paste an API key
  ${C.brand("/dashboard")}       open the live web dashboard (watch · inject · settings · STOP)
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
  let dashboardUrl = "";
  let busy = false; // true while a goal is being triaged/convened — input is gated until it clears
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const printAbove = (text: string): void => {
    process.stdout.write("\r\x1b[K" + text + "\n");
    if (!closed) rl.prompt(true);
  };
  const info = (text: string): void => printAbove(`\x1b[2m${text}\x1b[0m`);

  // A live spinner for the "starting up" wait, so the user sees motion (not a frozen "thinking…").
  // Redraws one line in place; input is paused meanwhile, so it never fights the prompt.
  const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let spinTimer: ReturnType<typeof setInterval> | undefined;
  let spinFrame = 0;
  let spinStart = 0;
  const startSpinner = (label: string): void => {
    stopSpinner();
    spinStart = Date.now();
    const draw = (): void => {
      const secs = Math.floor((Date.now() - spinStart) / 1000);
      const t = secs >= 3 ? C.dim(` · ${secs}s`) : "";
      process.stdout.write(`\r\x1b[K${C.brand(SPIN[spinFrame % SPIN.length]!)} ${C.dim(label)}${t}`);
      spinFrame++;
    };
    draw();
    spinTimer = setInterval(draw, 90);
  };
  const stopSpinner = (): void => {
    if (spinTimer) {
      clearInterval(spinTimer);
      spinTimer = undefined;
    }
    process.stdout.write("\r\x1b[K"); // wipe the spinner line
  };

  // Start the local web dashboard once and keep it up for the whole shell session, so its URL is
  // stable and can be shown in the welcome. Returns the URL (empty string if it can't start).
  const ensureServer = async (env?: Record<string, string | undefined>): Promise<string> => {
    if (!server) {
      const e = env ?? (await resolveSecretsEnv(knownKeyEnvs(await loadConfig(projectRoot))));
      server = new QuorumHttpServer({ projectRoot, renderDashboard, autonomous: true, env: e });
      const listen = await server.listen();
      dashboardUrl = listen.url;
    }
    return dashboardUrl;
  };

  console.log("\n" + quorumLogo() + "\n" + C.muted("        the session never dies · you're always at the table") + "\n");
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

  // Bring the live web dashboard up now so its URL is part of the welcome (settings & models work
  // even before you start a goal). Optional — if it can't bind, the shell still works.
  try {
    const url = await ensureServer();
    if (url) console.log(`  ${C.brand("◆")} Live dashboard: ${C.cyan(url)}  ${C.dim("— watch · inject · ⚙ settings/models · STOP")}\n`);
  } catch {
    /* dashboard is optional at startup */
  }
  rl.prompt();

  const startGoal = async (goal: string): Promise<void> => {
    // Gate input + show a live spinner while we work out what to do and spin up the table. New
    // keystrokes are paused (buffered by the terminal) until this clears, so goals can't collide.
    busy = true;
    rl.pause();
    startSpinner("reading your goal…");
    try {
      const config = await loadConfig(projectRoot);
      const env = await resolveSecretsEnv(knownKeyEnvs(config));

      // Triage: don't convene a roundtable for a greeting / small talk / a quick question.
      // Obvious cases are instant (no model call); only ambiguous input costs a model turn.
      let decision = quickTriage(goal);
      if (!decision) {
        const triageRunner = buildTriageRunner(config, { env });
        if (triageRunner) {
          startSpinner("thinking…");
          decision = await triage(triageRunner, goal);
        }
      }
      if (decision?.intent === "chat") {
        stopSpinner();
        printAbove(`  ${C.cyan(decision.reply ?? "Hi!")}`);
        return;
      }

      if (session && running) await session.stop();
      startSpinner("convening the roundtable — proposer · critic · arbiter…");
      await ensureServer(env);
      session = await server!.daemon.createSession(goal, config);
      running = true;
      lastEventAt = Date.now();
    } finally {
      stopSpinner();
      busy = false;
      rl.resume();
    }
    // Reached only on a real goal (chat/early-return exited above); wipe done, prompt is clean.
    info(`✱ session ${session!.id} started · dashboard ${dashboardUrl}`);
    session!.subscribe((e) => {
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
          // Restart the dashboard so freshly-added keys/models take effect (unless mid-run).
          if (!running && server) {
            await server.close();
            server = undefined;
            dashboardUrl = "";
            const url = await ensureServer().catch(() => "");
            if (url) info(`dashboard: ${url}`);
          }
          return;
        case "dashboard": {
          const url = await ensureServer().catch(() => "");
          info(url ? `web dashboard: ${url}  (watch live · inject a message · ⚙ settings & models · STOP)` : "couldn't start the dashboard — is the port free?");
          return;
        }
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
          console.log(C.dim(`  Pick specific models (Opus 4.8, GPT-5.5, free OpenRouter…) with /models or the dashboard ⚙ Settings.`));
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
    // While a goal is being triaged/convened, ignore stray input (the terminal buffers it and it
    // replays once we're ready) so a second goal can't race the first.
    if (busy) return;
    void handle(raw)
      .catch((err) => printAbove(`\x1b[31merror:\x1b[0m ${String(err instanceof Error ? err.message : err)}`))
      .finally(() => {
        if (!closed && !busy) rl.prompt();
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
