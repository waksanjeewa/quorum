---
id: 260
title: One-line install + login/onboarding
status: todo
owner: null
deps: [090]
owned_paths: ["packages/cli/", "install.sh", "README.md"]
acceptance:
  - CLI package is publishable — proper bin, files, shebang, engines; `npm i -g quorum` (once published) exposes `quorum`
  - `quorum doctor` reports which model seats are logged in / reachable (claude, codex, ollama, and any configured HTTP providers) with actionable hints (run `claude login`, set OPENROUTER_API_KEY, start `ollama serve`)
  - `quorum init` scaffolds a starter .quorum/config.yaml in the current project
  - install.sh clones + builds + links the CLI for source installs; README documents both the npm one-liner and the source path
  - README "Getting started" = install → login to a model → quorum start
---
## Notes
Repo is private today; the true one-liner (`npm i -g quorum`) needs an npm publish (or a public repo + `npm i -g github:...`). Ship the packaging + doctor + init now so it's ready; document the source install for the private phase.

## Journal
- (empty)
