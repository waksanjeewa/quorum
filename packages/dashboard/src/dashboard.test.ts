import { describe, expect, it } from "vitest";
import { APP_VERSION, renderDashboard } from "./index.js";

describe("renderDashboard", () => {
  const html = renderDashboard("secret-token-123");

  it("embeds the token and core UI elements", () => {
    expect(html).toContain("secret-token-123");
    expect(html).toContain('<body data-view="compose">'); // never boot to a header-only blank shell
    expect(html).toContain('id="feed"');
    expect(html).toContain('id="msg"'); // inject box
    expect(html).toContain('id="stop"'); // STOP button
    expect(html).toContain('id="sessions"'); // roundtable list
    expect(html).toContain('id="activity"'); // active agents/activity
    expect(html).toContain('class="qLogo"'); // real Quorum mark in the header
    expect(html).toContain('class="qLogo heroLogo"'); // real Quorum mark in the compose hero
    expect(html).toContain(`v${APP_VERSION}`); // public app version
    expect(html).toContain("#F59E0B"); // single amber consensus node
    expect(html).toContain('data-p="Frugal"'); // explicit frugal-mode button
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
    expect(html).toContain("Apply frugal chains"); // choose free drafts + paid verifiers
    expect(html).toContain("Free draft models");
    expect(html).toContain("Paid verifier models");
  });

  it("wires New roundtable, session list, activity, and clarification UX", () => {
    expect(html).toContain("refreshSessions");
    expect(html).toContain("showCompose");
    expect(html).toContain("t.intent === \"clarify\"");
    expect(html).toContain("Roundtables");
    expect(html).toContain("Activity");
    expect(html).toContain("activitySeat"); // agent/model chips live under Activity
  });

  it("has a safe dashboard boot path when local API/settings data is unavailable", () => {
    expect(html).toContain("normalizeSettings");
    expect(html).toContain("fallbackSettings");
    expect(html).toContain("showBootProblem");
    expect(html).toContain("Dashboard needs a refresh");
    expect(html).toContain("Retry now");
    expect(html).toContain("body:not([data-view]) #compose");
    expect(html).toContain("Array.isArray(body.sessions)");
  });

  it("emits browser-parseable inline JavaScript", () => {
    const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script)).not.toThrow();
  });
});
