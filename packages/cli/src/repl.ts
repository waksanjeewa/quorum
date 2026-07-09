import { createInterface, type Interface as Readline } from "node:readline";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { QuorumHttpServer, loadConfig, doctorReport } from "@quorum/daemon";
import { renderDashboard } from "@quorum/dashboard";
import { formatEvent } from "./format.js";
import { runSetup } from "./setup.js";
import { resolveSecretsEnv } from "./keychain.js";
import type { RunningSession } from "@quorum/daemon";

const PROMPT = "\x1b[1mquorum›\x1b[0m ";
const HELP = `
Commands (type a goal to start building; while running, type to inject):
  /models          pick your models (login or paste an API key)
  /doctor          check which model seats are ready
  /status          show the current session
  /pause /resume   pause / resume the running session
  /stop            stop the running session (kill switch)
  /config          show where your config lives
  /help            this help
  /exit            leave quorum
`;

/** The interactive Quorum shell: stay inside `quorum`, drive it with `/` commands. */
export async function repl(projectRoot: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: PROMPT });
  let server: QuorumHttpServer | undefined;
  let session: RunningSession | undefined;
  let running = false;
  let interrupts = 0;
  let closed = false;

  const printAbove = (text: string): void => {
    process.stdout.write("\r\x1b[K" + text + "\n");
    if (!closed) rl.prompt(true);
  };
  const info = (text: string): void => printAbove(`\x1b[2m${text}\x1b[0m`);

  console.log("\n\x1b[1mQuorum\x1b[0m — multiple AI models plan and build together.");
  try {
    await access(join(projectRoot, ".quorum", "config.yaml"));
  } catch {
    console.log("\x1b[2mNo models configured yet — type /models to set up.\x1b[0m");
  }
  console.log("\x1b[2mType a goal, or /help. Ctrl+C to interrupt, /exit to leave.\x1b[0m\n");
  rl.prompt();

  const startGoal = async (goal: string): Promise<void> => {
    const config = await loadConfig(projectRoot);
    const keyEnvs = Object.values(config.providers).map((p) => p.keyEnv);
    const env = await resolveSecretsEnv(keyEnvs);
    if (server) await server.close();
    server = new QuorumHttpServer({ projectRoot, renderDashboard, autonomous: true, env });
    const listen = await server.listen();
    session = await server.daemon.createSession(goal, config);
    running = true;
    info(`session ${session.id} started · dashboard ${listen.url}`);
    session.subscribe((e) => printAbove(formatEvent(e)));
    void session.wait().then(() => {
      running = false;
      const s = session?.status();
      printAbove(`\x1b[1m✓ done\x1b[0m \x1b[2m(${s?.stage}, ${s?.turns} turns${s?.converged ? ", converged" : ""})\x1b[0m`);
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
          const report = await doctorReport(await loadConfig(projectRoot));
          for (const c of report) console.log(`  ${c.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${c.id} \x1b[2m${c.detail}\x1b[0m`);
          return;
        }
        case "status":
          console.log(session ? `  ${session.status().state} · stage ${session.status().stage} · ${session.status().turns} turns` : "  No session yet.");
          return;
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
  if (server) await server.close();
  console.log("\nBye.");
}
