#!/usr/bin/env node
import { QuorumHttpServer, loadConfig } from "@quorum/daemon";
import { renderDashboard } from "@quorum/dashboard";
import { requireClient } from "./client.js";
import { control, inject, listSessions, statusOf, streamEvents } from "./commands.js";
import { formatEvent } from "./format.js";

const HELP = `Quorum — multiple AI models collaborate on one goal.

Usage:
  quorum start "<goal>"     Boot the daemon, start a session, stream the transcript
  quorum status             Show all sessions
  quorum inject "<msg>"     Send a message into the latest session (without stopping it)
  quorum pause | resume     Pause / resume the latest session
  quorum stop               Stop the latest session (kill switch)
  quorum attach [id]        Stream a running session's transcript (Ctrl+C detaches, does not stop)
`;

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  const projectRoot = process.cwd();

  switch (cmd) {
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

async function start(projectRoot: string, goal: string): Promise<void> {
  const server = new QuorumHttpServer({ projectRoot, renderDashboard });
  const info = await server.listen();
  const config = await loadConfig(projectRoot);
  const running = await server.daemon.createSession(goal, config);

  console.log(`\n  Quorum session \x1b[1m${running.id}\x1b[0m started`);
  console.log(`  Dashboard/API: ${info.url}`);
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
