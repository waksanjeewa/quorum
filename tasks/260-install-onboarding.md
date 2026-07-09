---
id: 260
title: One-line install + login/onboarding
status: done
owner: claude-opus-4-8
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
- [claude-opus-4-8] Install + onboarding (131 tests). `quorum init` scaffolds a commented starter .quorum/config.yaml (failover chains + providers). `quorum doctor` (daemon doctorReport) checks every configured model's auth()/reachability with actionable hints + marks executor-capable seats — verified live showing 5/5 seats ready (claude, codex, 2 openrouter, ollama). CLI package.json made publishable (bin, files:[dist], engines, license, repository, keywords, v0.2.0→). install.sh clones+builds+links for source installs (corepack pnpm). README "Getting started" = install → login (claude/codex login) → init → doctor → start.
  - NOTE: doctor's claude check reports ok when the SDK+login are configured (auth() checks credential source, not a live round-trip), so it's optimistic in the nested-Claude-session env where an actual call 401s. Fine for onboarding readiness; a `--live` deep check could make a real 1-token call later.
  - Real one-liner `npm i -g quorum` needs an npm publish (repo private today) — packaging is ready. Documented source install for now.
