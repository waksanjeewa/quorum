# Publishing & going public

Quorum is built to publish as a **single self-contained npm package** (`quorum`) — no workspace
packages needed by consumers. This is the checklist to make it installable by the world.

## Pre-flight

- [ ] `corepack pnpm build && corepack pnpm test` green
- [ ] Bump the version in `packages/cli/package.json` (+ add a `CHANGELOG.md` entry)
- [ ] Verify the bundle is self-contained:
  ```bash
  cd packages/cli && npm pack --pack-destination /tmp
  cd /tmp && tar xzf quorum-*.tgz && node package/dist/index.js --version   # should print the version
  grep -c 'from "@quorum' package/dist/index.js                            # must be 0
  ```

## Make the repo public

```bash
gh repo edit waksanjeewa/quorum --visibility public --accept-visibility-change-consequences
```
Once public, the `curl … install.sh | bash` source install works for everyone.

## Publish to npm (the true one-liner)

```bash
npm login                       # once
cd packages/cli
npm publish --access public     # runs prepack → bundles automatically
```
After this, anyone can:
```bash
npm install -g quorum
quorum
```

The agent SDKs (`@anthropic-ai/claude-agent-sdk`, `@openai/codex-sdk`) install automatically as
`optionalDependencies` for the Claude/Codex seats; everything else is bundled.

## Nice-to-have before a big launch

- A short demo recording (asciinema/GIF) at the top of the README.
- Grow the benchmark goal set for stronger numbers (`bench/run.mjs`).
- Verify the VS Code extension in the Extension Development Host and package a `.vsix`.
