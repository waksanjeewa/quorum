import { createInterface, type Interface as Readline } from "node:readline";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { QuorumHttpServer, loadConfig, doctorReport, liveTurnCheck, buildTriageRunner } from "@quorum/daemon";
import { triage, quickTriage, parseSessionConfig, type SessionConfig } from "@quorum/core";
import { renderDashboard } from "@quorum/dashboard";
import { formatEvent } from "./format.js";
import { runFrugalSetup, runSetup } from "./setup.js";
import { resolveSecretsEnv, knownKeyEnvs } from "./keychain.js";
import { C, PROMPT, promptWith, quorumLogo } from "./theme.js";
import type { RunningSession } from "@quorum/daemon";

/** Slash commands + one-line help, for the "type /" menu and Tab completion. */
export const SLASH_COMMANDS: Array<[string, string]> = [
  ["/goal", "build this goal directly (skip the chat/greeting check)"],
  ["/models", "pick models — login or paste an API key"],
  ["/frugal", "configure free drafts + paid verification"],
  ["/dashboard", "open the live web dashboard"],
  ["/doctor", "check which model seats are ready"],
  ["/agents", "seats, live activity & elapsed time"],
  ["/status", "one-line session status"],
  ["/pause", "pause the running session"],
  ["/resume", "resume the running session"],
  ["/stop", "stop the session (kill switch)"],
  ["/config", "show where your config lives"],
  ["/help", "full help"],
  ["/exit", "leave quorum"],
];
const ALL_CMDS = SLASH_COMMANDS.map(([c]) => c);
/** Tab-completion for slash commands (readline calls this). */
export const completeSlash = (line: string): [string[], string] => {
  if (!line.startsWith("/")) return [[], line];
  const hits = ALL_CMDS.filter((c) => c.startsWith(line));
  return [hits.length ? hits : ALL_CMDS, line];
};

export const slashMenuMatches = (line: string): Array<[string, string]> => {
  if (!line.startsWith("/") || line.includes(" ")) return [];
  return SLASH_COMMANDS.filter(([c]) => c.startsWith(line));
};

export const nextSlashSelection = (current: number, count: number, direction: -1 | 1): number =>
  count <= 0 ? 0 : (current + direction + count) % count;

export const executorIdsForLiveCheck = (config: SessionConfig, okIds: Map<string, boolean>): string[] =>
  [...new Set(Object.values(config.seats).flatMap((s) => s.chain))].filter((m) => /^(claude|codex)(\/|$)/.test(m) && okIds.get(m));

export const codexLiveCheckTip = (id: string, detail: string): string =>
  id.startsWith("codex") && /newer version of Codex|not supported when using Codex/i.test(detail)
    ? "fix: update the Codex app, or drop the codex seat with /models, or use an API key (openai-api / github / openrouter)."
    : "";

export const renderSlashMenu = (matches: Array<[string, string]>, cursorColumn = 0, selectedIndex = 0): string => {
  if (matches.length === 0) return "";
  const w = Math.max(...matches.map(([c]) => c.length));
  const selected = Math.min(Math.max(0, selectedIndex), matches.length - 1);
  const lines = matches.map(([c, d], i) => {
    const marker = i === selected ? C.amber("›") : " ";
    const command = i === selected ? C.amber(c.padEnd(w)) : C.brand(c.padEnd(w));
    return `  ${marker} ${command}  ${C.dim(d)}`;
  });
  const column = Math.max(0, Math.floor(cursorColumn));
  const restoreColumn = column > 0 ? `\x1b[${column}C` : "";
  // Draw below the prompt, then explicitly move back up to the input line. This avoids depending
  // on terminal-specific cursor save/restore sequences, which can leave each next key on a new row.
  return `\n${lines.join("\n")}\x1b[${lines.length}A\r${restoreColumn}`;
};

const HELP = `${C.bold("Commands")} ${C.dim("(type a goal to build; while running, type to send a message to the table)")}
  ${C.brand("/goal")} ${C.dim("<text>")}    start building this goal directly (skip the chat/greeting check)
  ${C.brand("/models")}          pick your models — login or paste an API key
  ${C.brand("/frugal")}          choose free drafting models + paid verifier models
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

/** Pretty model id: bare claude/codex are the account-default model. */
const prettyModel = (m: string): string => (m === "claude" || m === "codex" ? `${m} ${C.dim("(account default)")}` : m);

/** Answer a question about Quorum's OWN setup directly from config — no roundtable, no guessing. */
function answerAboutConfig(config: {
  seats: Record<string, { chain: string[] }>;
  budgets?: { maxTurnsPerStage?: number; maxCostUsd?: number; wallClockMax?: string };
  execution?: { parallel?: boolean; maxConcurrency?: number; subagents?: boolean };
}): string {
  const lines: string[] = [`  ${C.bold("Here's your table right now")} ${C.dim("(from .quorum/config.yaml):")}`];
  for (const [seat, s] of Object.entries(config.seats)) {
    const chain = s.chain.map((m, i) => (i === 0 ? C.cyan(prettyModel(m)) : C.dim(prettyModel(m)))).join(C.dim(" → "));
    lines.push(`    ${C.brand(seat.padEnd(9))} ${chain || C.dim("(none)")}`);
  }
  const b = config.budgets ?? {};
  const budget = [
    b.maxTurnsPerStage ? `${b.maxTurnsPerStage} turns/stage` : "",
    b.maxCostUsd != null ? `max $${b.maxCostUsd}` : "",
    b.wallClockMax ? `max ${b.wallClockMax}` : "",
  ].filter(Boolean).join(" · ");
  if (budget) lines.push(`    ${C.dim("budgets".padEnd(9))} ${C.dim(budget)}`);
  // Which providers / logins / API keys the models imply — answers "what API do I have?".
  const provs = new Set<string>();
  for (const s of Object.values(config.seats)) {
    for (const m of s.chain) {
      if (m === "claude" || m.startsWith("claude/")) provs.add("Claude (login)");
      else if (m === "codex" || m.startsWith("codex/")) provs.add("Codex (login)");
      else if (m.startsWith("ollama/")) provs.add("Ollama (local)");
      else if (m.includes("/")) provs.add(`${m.split("/")[0]} (API key)`);
    }
  }
  if (provs.size) lines.push(`    ${C.dim("apis".padEnd(9))} ${C.dim([...provs].join(" · "))}`);
  const e = config.execution ?? {};
  const swarm = e.parallel === false ? "one at a time" : `swarm${e.maxConcurrency ? ` ×${e.maxConcurrency}` : " (auto)"}`;
  lines.push(`    ${C.dim("agents".padEnd(9))} ${C.dim(`${swarm} · subagents ${e.subagents === false ? "off" : "on"}`)}`);
  const unique = new Set(Object.values(config.seats).flatMap((s) => s.chain));
  if (unique.size === 1) lines.push(`  ${C.dim("All seats use one model — add others with /models for real multi-model debate.")}`);
  lines.push(`  ${C.dim("First model in each chain leads; the rest are failover.")}`);
  lines.push(`  ${C.dim("Add a model / paste an API key: /models   ·   check what's reachable & fix issues: /doctor")}`);
  lines.push(`  ${C.dim("Toggle parallel agents & subagents in the dashboard ⚙ Settings → Agents & execution.")}`);
  return lines.join("\n");
}

/** The interactive Quorum shell: stay inside `quorum`, drive it with `/` commands. */
export async function repl(projectRoot: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: PROMPT, completer: completeSlash });
  let server: QuorumHttpServer | undefined;
  let session: RunningSession | undefined;
  let running = false;
  let interrupts = 0;
  let closed = false;
  let lastEventAt = 0;
  let dashboardUrl = "";
  let busy = false; // true while a goal is being triaged/convened — input is gated until it clears
  let startupAbort: AbortController | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let selectedSlashCommandForEnter: string | undefined;
  let activeSlashMenuCommand: string | undefined;
  let handlingLine = false;
  let promptPrintedDuringHandle = false;

  // ── Ephemeral "/" menu (like Claude): drawn BELOW the prompt with cursor control, erased with
  // \x1b[0J — it never enters scrollback, so nothing piles up. State: how many lines are drawn.
  let menuOpen = 0;
  const eraseMenu = (): void => {
    if (!menuOpen) return;
    process.stdout.write("\x1b[0J"); // clear from cursor to end of screen (the menu lives below)
    menuOpen = 0;
  };

  const printAbove = (text: string): void => {
    eraseMenu();
    process.stdout.write("\r\x1b[K" + text + "\n");
    if (!closed) {
      rl.prompt(true);
      if (handlingLine) promptPrintedDuringHandle = true;
    }
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

  // Reflect session state in the prompt so it's clear you're inside a run.
  const refreshPrompt = (): void => {
    rl.setPrompt(running && session ? promptWith(session.status().stage) : PROMPT);
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

  console.log("\n" + quorumLogo() + "\n");
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

  const onProcessSigint = (): void => {
    if (busy && startupAbort && !startupAbort.signal.aborted) startupAbort.abort();
  };
  process.on("SIGINT", onProcessSigint);

  const startGoal = async (goal: string, force = false): Promise<void> => {
    // Gate input + show a live spinner while we work out what to do and spin up the table. New
    // keystrokes are paused (buffered by the terminal) until this clears, so goals can't collide.
    busy = true;
    const startup = new AbortController();
    startupAbort = startup;
    rl.pause();
    startSpinner("reading your goal…");
    try {
      const config = await loadConfig(projectRoot);
      if (startup.signal.aborted) return;
      const env = await resolveSecretsEnv(knownKeyEnvs(config));
      if (startup.signal.aborted) return;

      // Triage: don't convene a roundtable for a greeting / small talk / a quick question.
      // Obvious cases are instant (no model call); only ambiguous input costs a model turn.
      // `force` (from /goal) skips triage entirely and goes straight to building.
      let decision: { intent: "chat" | "clarify" | "build" | "meta"; reply?: string } | null = force ? { intent: "build" } : quickTriage(goal);
      if (!decision) {
        const triageRunner = buildTriageRunner(config, { env });
        if (triageRunner) {
          startSpinner("thinking…");
          decision = await triage(triageRunner, goal, startup.signal);
          if (startup.signal.aborted) return;
        }
      }
      if (decision?.intent === "chat") {
        stopSpinner();
        printAbove(`  ${C.cyan(decision.reply ?? "Hi!")}`);
        return;
      }
      if (decision?.intent === "clarify") {
        stopSpinner();
        printAbove(`  ${C.amber("◆")} ${C.cyan(decision.reply ?? "What should the models build or change?")}`);
        return;
      }
      if (decision?.intent === "meta") {
        stopSpinner();
        printAbove(answerAboutConfig(config));
        return;
      }

      if (session && running) await session.stop();
      if (startup.signal.aborted) return;
      startSpinner("convening the roundtable — proposer · critic · arbiter…");
      await ensureServer(env);
      if (startup.signal.aborted) return;
      session = await server!.daemon.createSession(goal, config);
      running = true;
      lastEventAt = Date.now();
    } finally {
      stopSpinner();
      const cancelled = startup.signal.aborted;
      startupAbort = undefined;
      busy = false;
      rl.resume();
      if (cancelled) printAbove("cancelled. Type a goal or /help.");
    }
    if (!session || startup.signal.aborted) return;
    // Reached only on a real goal (chat/early-return exited above); wipe done, prompt is clean.
    info(`✱ session ${session!.id} started · dashboard ${dashboardUrl}`);
    refreshPrompt();
    session!.subscribe((e) => {
      lastEventAt = Date.now();
      if (e.type === "stage") refreshPrompt();
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
      refreshPrompt();
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
        case "goal": {
          const g = rest.join(" ").trim();
          if (!g) return void console.log("  Usage: /goal <what to build>  (skips the chat/greeting check)");
          await startGoal(g, true);
          return;
        }
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
        case "frugal":
          rl.pause();
          await runFrugalSetup(projectRoot, rl);
          rl.resume();
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
          const env = await resolveSecretsEnv(knownKeyEnvs(config));
          const report = await doctorReport(config, { env });
          const ok = new Map(report.map((c) => [c.id, c.ok]));
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
            { env },
          ).catch(() => []);
          const extra = detected.filter((d) => d.ok && !inUse.has(d.id.split("/")[0]));
          if (extra.length) console.log(C.dim(`\n  Also logged in (not in your config): ${extra.map((e) => e.id).join(", ")} — add with /models`));
          const unique = new Set(Object.values(config.seats).flatMap((s) => s.chain));
          if (unique.size === 1) console.log(C.dim(`  All seats use one model — /models to add others for real multi-model debate.`));
          const execIds = executorIdsForLiveCheck(config, ok);
          if (execIds.length) {
            console.log(C.bold("\n  Build test:"));
            console.log(C.dim("    Running one tiny turn for Claude/Codex so Codex login/model issues are caught now."));
            const turns = await liveTurnCheck(config, { ids: execIds, env });
            for (const t of turns) {
              console.log(`    ${t.ok ? C.green("✓") : C.red("✗")} ${t.id} ${C.dim(t.detail)}`);
              const tip = codexLiveCheckTip(t.id, t.detail);
              if (tip) console.log(`      ${C.dim(tip)}`);
            }
          }
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
          refreshPrompt();
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

    // A question about Quorum's OWN setup ("what models are we using?") → answer from config
    // directly, so it never confuses the roundtable. Works whether or not a session is running.
    if (quickTriage(text)?.intent === "meta") {
      printAbove(answerAboutConfig(await loadConfig(projectRoot)));
      return;
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
    // Enter = selection: the cursor just moved onto the menu's first row, so clear-down wipes the
    // menu before any command output prints.
    eraseMenu();
    const selected = selectedSlashCommandForEnter;
    selectedSlashCommandForEnter = undefined;
    // While a goal is being triaged/convened, ignore stray input (the terminal buffers it and it
    // replays once we're ready) so a second goal can't race the first.
    if (busy) return;
    const selectedFromMenu = selected ?? activeSlashMenuCommand;
    activeSlashMenuCommand = undefined;
    const submitted = selectedFromMenu && raw.trim().startsWith("/") && !raw.trim().includes(" ") ? selectedFromMenu : raw;
    handlingLine = true;
    promptPrintedDuringHandle = false;
    void handle(submitted)
      .catch((err) => printAbove(`\x1b[31merror:\x1b[0m ${String(err instanceof Error ? err.message : err)}`))
      .finally(() => {
        handlingLine = false;
        if (!closed && !busy && !promptPrintedDuringHandle) rl.prompt();
      });
  });

  // Live "/" menu (like Claude): while the line starts with "/", draw the matching commands BELOW
  // the prompt (cursor hops down, draws, hops back); it filters as you type and is ERASED — not
  // scrolled away — the moment you select (Enter), add an argument, or clear the line. TTY only.
  if (process.stdin.isTTY) {
    const rlAny = rl as unknown as { line?: string; cursor?: number; _refreshLine?: () => void };
    let menuMatches: Array<[string, string]> = [];
    let menuSelected = 0;
    let menuLine = "";
    const redrawInput = (): void => {
      try {
        rlAny._refreshLine?.();
      } catch {
        rl.prompt(true);
      }
    };
    const replaceInput = (line: string): void => {
      rlAny.line = line;
      rlAny.cursor = line.length;
    };
    const drawMenu = (matches: Array<[string, string]>, selected = menuSelected): void => {
      eraseMenu();
      menuMatches = matches;
      menuSelected = Math.min(Math.max(0, selected), Math.max(matches.length - 1, 0));
      activeSlashMenuCommand = menuMatches[menuSelected]?.[0];
      redrawInput();
      // Draw after readline refreshes the prompt; refreshing after drawing can clear the popup.
      process.stdout.write(renderSlashMenu(matches, rl.getCursorPos().cols, menuSelected));
      menuOpen = matches.length;
    };
    process.stdin.on("keypress", (_str: string, key: { name?: string } = {}) => {
        if (key.name === "return" && menuOpen && menuMatches[menuSelected]) {
          selectedSlashCommandForEnter = menuMatches[menuSelected]![0];
          return;
        }
      setImmediate(() => {
        if (closed || busy) {
          eraseMenu();
          return;
        }
        const line = rlAny.line ?? "";
        if ((key.name === "up" || key.name === "down") && menuOpen && menuMatches.length) {
          menuSelected = nextSlashSelection(menuSelected, menuMatches.length, key.name === "down" ? 1 : -1);
          replaceInput(menuLine);
          drawMenu(menuMatches, menuSelected);
          return;
        }
        if (!line.startsWith("/") || line.includes(" ")) {
          if (menuOpen) {
            eraseMenu();
            redrawInput();
          }
          menuMatches = [];
          menuSelected = 0;
          menuLine = "";
          activeSlashMenuCommand = undefined;
          return;
        }
        const matches = slashMenuMatches(line);
        if (matches.length === 0) {
          if (menuOpen) {
            eraseMenu();
            redrawInput();
          }
          menuMatches = [];
          menuSelected = 0;
          menuLine = "";
          activeSlashMenuCommand = undefined;
          return;
        }
        menuLine = line;
        menuSelected = Math.min(menuSelected, matches.length - 1);
        drawMenu(matches, menuSelected);
      });
    });
  }

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
  process.off("SIGINT", onProcessSigint);
  if (heartbeat) clearInterval(heartbeat);
  if (server) await server.close();
  console.log("\nBye.");
}
