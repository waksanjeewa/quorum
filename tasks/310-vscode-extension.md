---
id: 310
title: Phase 3 — VS Code extension (dashboard as a webview)
status: todo
owner: null
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
