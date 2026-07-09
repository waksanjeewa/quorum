import type { SessionStatus } from "@quorum/daemon";
import type { TranscriptEvent } from "@quorum/core";
import type { Client } from "./client.js";

export async function listSessions(client: Client): Promise<SessionStatus[]> {
  const res = await client.api("/sessions");
  const body = (await res.json()) as { sessions: SessionStatus[] };
  return body.sessions;
}

/** Most recently created session id (sessions are returned in creation order). */
export async function latestSessionId(client: Client): Promise<string | undefined> {
  const sessions = await listSessions(client);
  return sessions.at(-1)?.id;
}

async function resolveId(client: Client, id?: string): Promise<string> {
  const resolved = id ?? (await latestSessionId(client));
  if (!resolved) throw new Error("No sessions found.");
  return resolved;
}

export async function statusOf(client: Client, id?: string): Promise<SessionStatus> {
  const res = await client.api(`/sessions/${await resolveId(client, id)}`);
  return (await res.json()) as SessionStatus;
}

export async function inject(client: Client, content: string, id?: string): Promise<void> {
  await client.api(`/sessions/${await resolveId(client, id)}/inject`, "POST", { content });
}

export async function control(client: Client, action: "pause" | "resume" | "stop", id?: string): Promise<SessionStatus> {
  const res = await client.api(`/sessions/${await resolveId(client, id)}/${action}`, "POST");
  return (await res.json()) as SessionStatus;
}

/** Stream a session's transcript events over SSE (replay + live). */
export async function* streamEvents(client: Client, id: string, signal?: AbortSignal): AsyncGenerator<TranscriptEvent> {
  const res = await fetch(`${client.info.url}/sessions/${id}/events?token=${client.info.token}`, signal ? { signal } : {});
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (line) yield JSON.parse(line.slice(5).trim()) as TranscriptEvent;
    }
  }
}
