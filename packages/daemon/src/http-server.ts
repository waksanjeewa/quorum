import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { parseSessionConfig, type SessionConfig, type TranscriptEvent } from "@quorum/core";
import { Daemon, type DaemonOpts } from "./daemon.js";
import { loadConfig } from "./config.js";
import type { RunningSession } from "./session-runner.js";

export interface HttpServerOpts extends DaemonOpts {
  /** 0 = random free port (default). */
  port?: number;
  /** Override the bearer token (default: random). */
  token?: string;
}

export interface ListenInfo {
  port: number;
  token: string;
  url: string;
}

/** Local HTTP + SSE transport over the Daemon (SPEC §7). 127.0.0.1 only, bearer-token protected. */
export class QuorumHttpServer {
  readonly daemon: Daemon;
  private readonly token: string;
  private readonly desiredPort: number;
  private readonly projectRoot: string;
  private readonly server: Server;
  private info: ListenInfo | undefined;

  constructor(opts: HttpServerOpts) {
    this.daemon = new Daemon(opts);
    this.token = opts.token ?? randomUUID();
    this.desiredPort = opts.port ?? 0;
    this.projectRoot = opts.projectRoot;
    this.server = createServer((req, res) => void this.route(req, res));
  }

  async listen(): Promise<ListenInfo> {
    await new Promise<void>((resolve) => this.server.listen(this.desiredPort, "127.0.0.1", resolve));
    const addr = this.server.address();
    const port = typeof addr === "object" && addr ? addr.port : this.desiredPort;
    this.info = { port, token: this.token, url: `http://127.0.0.1:${port}` };
    const dir = join(this.projectRoot, ".quorum");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "daemon.json"),
      JSON.stringify({ port, token: this.token, pid: process.pid, url: this.info.url }, null, 2),
      "utf8",
    );
    return this.info;
  }

  async close(): Promise<void> {
    await this.daemon.stopAll();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
    await rm(join(this.projectRoot, ".quorum", "daemon.json"), { force: true });
  }

  // ---- routing ----

  private authOk(req: IncomingMessage, url: URL): boolean {
    const header = req.headers.authorization;
    if (header === `Bearer ${this.token}`) return true;
    return url.searchParams.get("token") === this.token; // EventSource can't set headers
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const parts = url.pathname.split("/").filter(Boolean);

    if (!this.authOk(req, url)) return json(res, 401, { error: "unauthorized" });

    try {
      // /sessions ...
      if (parts[0] === "sessions") {
        if (parts.length === 1 && req.method === "GET") {
          return json(res, 200, { sessions: this.daemon.list().map((s) => s.status()) });
        }
        if (parts.length === 1 && req.method === "POST") {
          const body = await readJson(req);
          const config = body.config ? parseSessionConfig(body.config) : await loadConfig(this.projectRoot);
          const running = await this.daemon.createSession(String(body.goal ?? "Untitled goal"), config as SessionConfig);
          return json(res, 201, running.status());
        }
        const running = parts[1] ? this.daemon.get(parts[1]) : undefined;
        if (!running) return json(res, 404, { error: "session not found" });
        return this.routeSession(req, res, url, parts.slice(2), running);
      }
      return json(res, 404, { error: "not found" });
    } catch (err) {
      return json(res, 500, { error: String(err) });
    }
  }

  private async routeSession(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    rest: string[],
    running: RunningSession,
  ): Promise<void> {
    const sub = rest[0];
    if (!sub && req.method === "GET") return json(res, 200, running.status());
    if (sub === "events" && req.method === "GET") return this.streamEvents(req, res, running);

    if (req.method === "POST") {
      switch (sub) {
        case "inject": {
          const body = await readJson(req);
          await running.inject(String(body.content ?? ""));
          return json(res, 200, { ok: true });
        }
        case "command": {
          const body = await readJson(req);
          return json(res, 200, await this.handleCommand(running, String(body.command ?? "")));
        }
        case "pause":
          running.pause();
          return json(res, 200, running.status());
        case "resume":
          running.resume();
          return json(res, 200, running.status());
        case "stop":
          await running.stop();
          return json(res, 200, running.status());
      }
    }
    return json(res, 404, { error: "unknown session route" });
  }

  private async handleCommand(running: RunningSession, command: string): Promise<{ ok: boolean; message: string }> {
    const [verb, ...args] = command.replace(/^\//, "").trim().split(/\s+/);
    switch (verb) {
      case "pause":
        running.pause();
        return { ok: true, message: "paused" };
      case "resume":
        running.resume();
        return { ok: true, message: "resumed" };
      case "stop":
        await running.stop();
        return { ok: true, message: "stopped" };
      case "status":
        return { ok: true, message: JSON.stringify(running.status()) };
      case "inject":
        await running.inject(args.join(" "));
        return { ok: true, message: "injected" };
      default:
        return { ok: false, message: `unknown command: /${verb}` };
    }
  }

  private streamEvents(req: IncomingMessage, res: ServerResponse, running: RunningSession): void {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const send = (e: TranscriptEvent, index: number): void => {
      res.write(`id: ${index}\ndata: ${JSON.stringify(e)}\n\n`);
    };
    const unsubscribe = running.subscribe(send);
    req.on("close", () => {
      unsubscribe();
      res.end();
    });
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}
