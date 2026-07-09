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
});
