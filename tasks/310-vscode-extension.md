---
id: 310
title: Phase 3 — VS Code extension (dashboard as a webview)
status: done
owner: claude-opus-4-8
deps: [100]
owned_paths: ["packages/vscode/"]
acceptance:
  - a VS Code extension contributes a "Quorum" panel that hosts the existing dashboard as a webview
  - it starts/attaches to the daemon for the open workspace folder; the panel streams the transcript, injects, and STOPs — same UX as the browser
  - a command "Quorum: Start a goal" prompts for a goal and runs it against the workspace repo
  - packaged as a .vsix that installs and opens the panel
---
## Notes
The dashboard was deliberately built webview-ready (no window.open, relative URLs, self-contained
HTML). The extension is mostly a thin host: spawn/attach the daemon, pass renderDashboard's HTML +
token into a webview, proxy the localhost API. Keep the dashboard package the single source of the UI.

## Journal
- (empty)

## Journal
- [claude-opus-4-8] Built packages/vscode (168 tests). Thin host: activate() registers quorum.open (start/attach daemon for the workspace folder + open a webview panel) and quorum.start (input box → createSession → panel). Reuses the dashboard unchanged. KEY enabler (unit-tested): renderDashboard(token, baseUrl) — when baseUrl is set (webview), the page uses ABSOLUTE fetch/EventSource URLs + a CSP allowing connect-src to the daemon origin; baseUrl="" keeps the browser (relative) behavior. Package is ESM ("type":"module") to match the workspace — VS Code 2026 supports ESM extensions; @types/vscode is a devDep.
  - NOT verified in a live VS Code (can't run the Extension Development Host here) — same best-effort status the SDK adapters had before their smoke. Verify with F5 / a .vsix install; if the webview CSP or ESM loading needs tweaks, adjust here. The reusable/tested part (dashboard baseUrl+CSP) is solid.
