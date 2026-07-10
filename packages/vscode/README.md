# Quorum for VS Code

Hosts the Quorum dashboard as an editor panel and drives the daemon for your open workspace folder.

## Commands
- **Quorum: Open Panel** — start/attach the daemon and open the dashboard webview
- **Quorum: Start a Goal** — prompt for a goal and run it against the workspace repo

## Run it (development)
```bash
corepack pnpm build          # from the repo root — builds all @quorum/* packages + this extension
```
Then open `packages/vscode` in VS Code and press **F5** (Extension Development Host), or package it:
```bash
cd packages/vscode && npx @vscode/vsce package   # produces a .vsix you can install
```

## Status
The extension **compiles** against the VS Code API and reuses the dashboard unchanged (the dashboard
renders with an absolute base URL + CSP when hosted in a webview — see `renderDashboard(token, baseUrl)`,
which is unit-tested). The end-to-end webview behavior has **not been verified in a running VS Code**
here — do that in the Extension Development Host and note any CSP/module tweaks in `tasks/310`.
