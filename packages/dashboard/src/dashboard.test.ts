import { describe, expect, it } from "vitest";
import { renderDashboard } from "./index.js";

describe("renderDashboard", () => {
  const html = renderDashboard("secret-token-123");

  it("embeds the token and core UI elements", () => {
    expect(html).toContain("secret-token-123");
    expect(html).toContain('id="feed"');
    expect(html).toContain('id="msg"'); // inject box
    expect(html).toContain('id="stop"'); // STOP button
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

  it("includes the settings panel wired to the config API", () => {
    expect(html).toContain('id="settings"'); // ⚙ button
    expect(html).toContain('id="settingsPanel"');
    expect(html).toContain('id="cfgText"'); // editor
    expect(html).toContain('id="cfgSave"');
    expect(html).toContain('"/config"'); // GET
    expect(html).toContain('api("/config", "PUT"'); // save
  });
});
