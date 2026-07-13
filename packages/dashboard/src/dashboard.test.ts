import { describe, expect, it } from "vitest";
import { renderDashboard } from "./index.js";

describe("renderDashboard", () => {
  const html = renderDashboard("secret-token-123");

  it("embeds the token and core UI elements", () => {
    expect(html).toContain("secret-token-123");
    expect(html).toContain('id="feed"');
    expect(html).toContain('id="msg"'); // inject box
    expect(html).toContain('id="stop"'); // STOP button
    expect(html).toContain('id="sessions"'); // roundtable list
    expect(html).toContain('id="activity"'); // active agents/activity
    expect(html).toContain('class="qLogo"'); // real Quorum mark in the header
    expect(html).toContain('class="qLogo heroLogo"'); // real Quorum mark in the compose hero
    expect(html).toContain("#F59E0B"); // single amber consensus node
    expect(html).not.toContain('id="seats"'); // separate agent cards are intentionally gone
    expect(html).not.toContain("<h3>Agents</h3>");
    expect(html).not.toContain("<span class=\"dia\">◆</span> Quorum");
    expect(html).toContain("EventSource"); // live stream
  });

  it("is fully self-contained — no external hosts", () => {
    // no protocol-based external references (CDNs, fonts, images)
    expect(html).not.toMatch(/https?:\/\/(?!127\.0\.0\.1)/);
    expect(html).not.toContain("<link");
    expect(html).not.toContain("cdn");
  });

  it("escapes the token as a JS string literal", () => {
    expect(renderDashboard('a"b')).toContain('"a\\"b"');
  });

  it("uses relative URLs by default (served by the daemon), no CSP", () => {
    expect(html).toContain('const BASE = ""');
    expect(html).not.toContain("Content-Security-Policy");
  });

  it("uses an absolute base URL + CSP when hosted in a webview", () => {
    const wv = renderDashboard("tok", "http://127.0.0.1:5555");
    expect(wv).toContain('const BASE = "http://127.0.0.1:5555"');
    expect(wv).toContain("Content-Security-Policy");
    expect(wv).toContain("connect-src http://127.0.0.1:5555");
  });

  it("includes the model-manager settings panel wired to the settings/keys API", () => {
    expect(html).toContain('id="settings"'); // ⚙ button
    expect(html).toContain('id="settingsPanel"');
    expect(html).toContain('id="settingsBody"'); // rich body
    expect(html).toContain('id="cfgSave"');
    expect(html).toContain('"/settings"'); // structured GET/PUT
    expect(html).toContain('"/keys"'); // save API key
    expect(html).toContain("renderSettings"); // model manager
  });

  it("wires New roundtable, session list, activity, and clarification UX", () => {
    expect(html).toContain("refreshSessions");
    expect(html).toContain("showCompose");
    expect(html).toContain("t.intent === \"clarify\"");
    expect(html).toContain("Roundtables");
    expect(html).toContain("Activity");
    expect(html).toContain("activitySeat"); // agent/model chips live under Activity
  });
});
