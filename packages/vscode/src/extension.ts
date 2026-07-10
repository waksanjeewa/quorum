import * as vscode from "vscode";
import { QuorumHttpServer, loadConfig, type ListenInfo } from "@quorum/daemon";
import { renderDashboard } from "@quorum/dashboard";

/**
 * VS Code extension: hosts the existing Quorum dashboard as a webview and drives the daemon for the
 * open workspace folder. The dashboard package remains the single source of the UI — this is a thin
 * host (spawn/attach the daemon, render the dashboard with an absolute base URL into a webview).
 */
let server: QuorumHttpServer | undefined;
let info: ListenInfo | undefined;
let panel: vscode.WebviewPanel | undefined;

function workspaceFolder(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function ensureServer(projectRoot: string): Promise<ListenInfo> {
  if (server && info) return info;
  server = new QuorumHttpServer({ projectRoot, autonomous: true });
  info = await server.listen();
  return info;
}

function openPanel(): void {
  if (!info) return;
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    return;
  }
  panel = vscode.window.createWebviewPanel("quorum", "Quorum", vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });
  // Absolute base URL so the webview's fetch/EventSource reach the local daemon.
  panel.webview.html = renderDashboard(info.token, info.url);
  panel.onDidDispose(() => {
    panel = undefined;
  });
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("quorum.open", async () => {
      const folder = workspaceFolder();
      if (!folder) return void vscode.window.showErrorMessage("Quorum: open a folder first.");
      await ensureServer(folder);
      openPanel();
    }),
    vscode.commands.registerCommand("quorum.start", async () => {
      const folder = workspaceFolder();
      if (!folder) return void vscode.window.showErrorMessage("Quorum: open a folder first.");
      const goal = await vscode.window.showInputBox({
        prompt: "What should the models build or plan?",
        placeHolder: "e.g. add a CSV export endpoint",
      });
      if (!goal) return;
      await ensureServer(folder);
      const config = await loadConfig(folder);
      await server!.daemon.createSession(goal, config);
      openPanel();
      void vscode.window.showInformationMessage(`Quorum: working on "${goal}"`);
    }),
  );
}

export async function deactivate(): Promise<void> {
  await server?.close();
  server = undefined;
  info = undefined;
}
