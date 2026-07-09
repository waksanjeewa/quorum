import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface DaemonInfo {
  port: number;
  token: string;
  url: string;
}

/** Read the running daemon's handshake file, or null if no daemon is up in this project. */
export async function readDaemonInfo(projectRoot: string): Promise<DaemonInfo | null> {
  try {
    const raw = await readFile(join(projectRoot, ".quorum", "daemon.json"), "utf8");
    return JSON.parse(raw) as DaemonInfo;
  } catch {
    return null;
  }
}

export interface Client {
  info: DaemonInfo;
  api(path: string, method?: string, body?: unknown): Promise<Response>;
}

export function makeClient(info: DaemonInfo): Client {
  return {
    info,
    api: (path, method = "GET", body) =>
      fetch(`${info.url}${path}`, {
        method,
        headers: { authorization: `Bearer ${info.token}`, "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
  };
}

/** Resolve a client from disk, throwing a friendly error if no daemon is running. */
export async function requireClient(projectRoot: string): Promise<Client> {
  const info = await readDaemonInfo(projectRoot);
  if (!info) throw new Error("No Quorum daemon is running here. Start one with:  quorum start \"<goal>\"");
  return makeClient(info);
}
