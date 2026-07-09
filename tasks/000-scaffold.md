---
id: 000
title: Monorepo scaffold
status: done
owner: claude-opus-4-8
deps: []
owned_paths: ["package.json", "pnpm-workspace.yaml", "tsconfig*.json", ".gitignore", "LICENSE", "packages/*/package.json", "packages/*/tsconfig.json", ".github/"]
acceptance:
  - pnpm install && pnpm build && pnpm test run clean at root (empty test suites OK)
  - five packages exist per SPEC §2 with correct names (@quorum/core, @quorum/adapters, @quorum/daemon, @quorum/dashboard, cli package "quorum") and dependency direction
  - TypeScript strict + ESM everywhere; vitest configured at root; MIT LICENSE present
  - git repo initialized with .gitignore (node_modules, dist, .quorum/)
---
## Notes
Root scripts: `build`, `test`, `lint` fan out via pnpm -r. GitHub Actions CI (install/build/test) is a plus, not required.

## Journal
- [claude-opus-4-8] Scaffolded pnpm workspace. 5 packages: @quorum/core, @quorum/adapters, @quorum/daemon, quorum (cli), @quorum/dashboard (placeholder build until task 100). TS project references enforce dep direction core←adapters←daemon←cli. Root: package.json, pnpm-workspace.yaml, tsconfig.base.json (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes + verbatimModuleSyntax + NodeNext ESM), vitest.config.ts (passWithNoTests). `pnpm install && pnpm build && pnpm test` all green.
  - Gotchas for next agents: (1) pnpm not on PATH globally — installed to ~/.local/bin via corepack (perm denied on /usr/local/bin); prefix commands with `export PATH="$HOME/.local/bin:$PATH"`. (2) esbuild build script must be approved — `allowBuilds: { esbuild: true }` in pnpm-workspace.yaml. (3) Node is v25 here (engines still says >=20). (4) Each tsconfig excludes *.test.ts from build; vitest runs them from src via ts directly.
  - Next: task 010 (core types + zod schemas in packages/core/src/types/).
