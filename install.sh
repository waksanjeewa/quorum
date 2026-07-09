#!/usr/bin/env bash
# Quorum — source install. Clones (if needed), builds, and links the `quorum` CLI globally.
# Once Quorum is published to npm, `npm install -g quorum` will be the one-liner instead.
set -euo pipefail

REPO="${QUORUM_REPO:-https://github.com/waksanjeewa/quorum.git}"
DIR="${QUORUM_DIR:-$HOME/.quorum-src}"

command -v git >/dev/null || { echo "git is required"; exit 1; }
command -v node >/dev/null || { echo "node >=20 is required (https://nodejs.org)"; exit 1; }

# pnpm via corepack (bundled with Node)
if ! command -v pnpm >/dev/null; then
  corepack enable pnpm 2>/dev/null || corepack enable --install-directory "$HOME/.local/bin" pnpm
  export PATH="$HOME/.local/bin:$PATH"
fi

if [ -d "$DIR/.git" ]; then
  echo "Updating $DIR…"; git -C "$DIR" pull --ff-only
else
  echo "Cloning into $DIR…"; git clone "$REPO" "$DIR"
fi

cd "$DIR"
pnpm install
pnpm build
pnpm --filter quorum exec npm link 2>/dev/null || (cd packages/cli && npm link)

echo
echo "✓ Installed. Next:"
echo "    quorum doctor          # see which models you're logged into"
echo "    quorum init            # scaffold a config in your project"
echo "    quorum start \"build me X\""
