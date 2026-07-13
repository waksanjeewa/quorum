#!/usr/bin/env bash
# Quorum — source install. Clones (if needed), installs prerequisites, builds, and links the
# `quorum` CLI globally. Once Quorum is published to npm, `npm install -g quorum` will be the
# one-liner instead.
set -euo pipefail

REPO="${QUORUM_REPO:-https://github.com/waksanjeewa/quorum.git}"
DIR="${QUORUM_DIR:-$HOME/.quorum-src}"
PNPM_VERSION="${QUORUM_PNPM_VERSION:-11.10.0}"

say() { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif [ "${QUORUM_NO_SUDO:-}" = "1" ]; then
    die "missing system packages and QUORUM_NO_SUDO=1 is set"
  elif have sudo; then
    sudo "$@"
  else
    die "missing system packages and sudo is not available"
  fi
}

node_major() {
  node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || printf '0'
}

needs_node() {
  ! have node || [ "$(node_major)" -lt 20 ]
}

pkg_manager() {
  if have brew; then echo brew
  elif have apt-get; then echo apt
  elif have dnf; then echo dnf
  elif have yum; then echo yum
  elif have pacman; then echo pacman
  elif have apk; then echo apk
  else echo none
  fi
}

dedupe_words() {
  awk '{
    for (i = 1; i <= NF; i++) {
      if (!seen[$i]++) {
        out = out ? out " " $i : $i
      }
    }
  } END { print out }'
}

install_system_packages() {
  [ "${QUORUM_SKIP_SYSTEM_DEPS:-}" = "1" ] && return 0

  local needs=""
  have git || needs="$needs git"
  needs_node && needs="$needs node"
  have npm || needs="$needs npm"
  have python3 || needs="$needs python3"

  # Linux API-key persistence uses libsecret's `secret-tool`. Without it Quorum still works with
  # environment variables, but installing it makes `/models` able to save keys securely.
  case "$(uname -s)" in
    Linux) have secret-tool || needs="$needs secret-tool" ;;
  esac

  needs="$(printf '%s\n' "$needs" | dedupe_words)"
  [ -z "$needs" ] && return 0

  local manager packages=""
  manager="$(pkg_manager)"
  [ "$manager" = "none" ] && {
    warn "missing tools:$needs"
    die "install Node >=20, git, npm, python3, and libsecret-tools/secret-tool if on Linux; or rerun with a package manager available"
  }

  say "Installing missing prerequisites with $manager:$needs"
  for item in $needs; do
    case "$manager:$item" in
      brew:node|brew:npm) packages="$packages node" ;;
      brew:python3) packages="$packages python" ;;
      brew:secret-tool) ;;
      apt:node) packages="$packages nodejs npm" ;;
      apt:npm) packages="$packages npm" ;;
      apt:python3) packages="$packages python3" ;;
      apt:secret-tool) packages="$packages libsecret-tools" ;;
      dnf:node|dnf:npm|yum:node|yum:npm) packages="$packages nodejs npm" ;;
      dnf:python3|yum:python3) packages="$packages python3" ;;
      dnf:secret-tool|yum:secret-tool) packages="$packages libsecret" ;;
      pacman:node|pacman:npm) packages="$packages nodejs npm" ;;
      pacman:python3) packages="$packages python" ;;
      pacman:secret-tool) packages="$packages libsecret" ;;
      apk:node) packages="$packages nodejs npm" ;;
      apk:npm) packages="$packages npm" ;;
      apk:python3) packages="$packages python3" ;;
      apk:secret-tool) packages="$packages libsecret" ;;
      *) packages="$packages $item" ;;
    esac
  done
  packages="$(printf '%s\n' "$packages" | dedupe_words)"
  [ -z "$packages" ] && return 0

  case "$manager" in
    brew)
      brew install $packages
      ;;
    apt)
      as_root apt-get update
      as_root apt-get install -y $packages
      ;;
    dnf)
      as_root dnf install -y $packages
      ;;
    yum)
      as_root yum install -y $packages
      ;;
    pacman)
      as_root pacman -Sy --needed --noconfirm $packages
      ;;
    apk)
      as_root apk add --no-cache $packages
      ;;
  esac
}

verify_prerequisites() {
  have git || die "git is required and could not be installed automatically"
  have node || die "Node.js >=20 is required and could not be installed automatically"
  [ "$(node_major)" -ge 20 ] || die "Node.js >=20 is required; found $(node -v). Install a current Node LTS from https://nodejs.org and rerun."
  have npm || die "npm is required and could not be installed automatically"
  have python3 || die "python3 is required for common project tasks and could not be installed automatically"
}

ensure_pnpm() {
  if have pnpm; then return 0; fi

  if have corepack; then
    mkdir -p "$HOME/.local/bin"
    corepack enable pnpm 2>/dev/null || corepack enable --install-directory "$HOME/.local/bin" pnpm 2>/dev/null || true
    export PATH="$HOME/.local/bin:$PATH"
    corepack prepare "pnpm@$PNPM_VERSION" --activate 2>/dev/null || true
  fi

  if ! have pnpm; then
    say "Installing pnpm@$PNPM_VERSION with npm…"
    npm install -g "pnpm@$PNPM_VERSION" || as_root npm install -g "pnpm@$PNPM_VERSION"
  fi
}

install_system_packages
verify_prerequisites
ensure_pnpm

say "Prerequisites:"
say "  node $(node -v)"
say "  npm $(npm -v)"
say "  pnpm $(pnpm -v)"
say "  git $(git --version | sed 's/^git version //')"
say "  python $(python3 --version | sed 's/^Python //')"
if have secret-tool; then
  say "  secret-tool available (Linux Keychain support)"
fi

if [ -d "$DIR/.git" ]; then
  say "Updating $DIR…"
  git -C "$DIR" pull --ff-only
else
  say "Cloning into $DIR…"
  git clone "$REPO" "$DIR"
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
