#!/usr/bin/env bash
set -euo pipefail

REPO="${ALFREDO_REPO:-getalfredo/bunalfredo}"
VERSION="${ALFREDO_VERSION:-latest}"
BINARY_NAME="alfredo"

usage() {
  cat <<'EOF'
Usage: install.sh [install-dir]

Downloads the published Alfredo binary from GitHub Releases and installs it as `alfredo`.

Environment variables:
  ALFREDO_VERSION      Release tag to install (default: latest)
  ALFREDO_INSTALL_DIR  Directory where the binary will be installed
  ALFREDO_REPO         GitHub repository in owner/name format
EOF
}

download() {
  local url="$1"
  local output="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO "$output" "$url"
    return
  fi

  echo "curl or wget is required to download Alfredo." >&2
  exit 1
}

resolve_install_dir() {
  if [ -n "${1:-}" ]; then
    printf '%s\n' "$1"
    return
  fi

  if [ -n "${ALFREDO_INSTALL_DIR:-}" ]; then
    printf '%s\n' "$ALFREDO_INSTALL_DIR"
    return
  fi

  if [ -w "/usr/local/bin" ]; then
    printf '%s\n' "/usr/local/bin"
    return
  fi

  printf '%s\n' "${HOME}/.local/bin"
}

resolve_asset_name() {
  local os
  local arch

  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"

  case "${os}-${arch}" in
    linux-x86_64)
      printf '%s\n' "alfredo-linux-x64"
      ;;
    *)
      echo "Unsupported platform: ${os}-${arch}. This installer currently publishes linux-x64 only." >&2
      exit 1
      ;;
  esac
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

asset_name="$(resolve_asset_name)"
install_dir="$(resolve_install_dir "${1:-}")"
mkdir -p "$install_dir"

if [ "$VERSION" = "latest" ]; then
  download_url="https://github.com/${REPO}/releases/latest/download/${asset_name}"
else
  download_url="https://github.com/${REPO}/releases/download/${VERSION}/${asset_name}"
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

target_path="${install_dir}/${BINARY_NAME}"
tmp_binary="${tmpdir}/${BINARY_NAME}"

echo "Downloading ${asset_name} from ${download_url}"
download "$download_url" "$tmp_binary"

chmod +x "$tmp_binary"
mv "$tmp_binary" "$target_path"

echo "Installed Alfredo to ${target_path}"

case ":$PATH:" in
  *":${install_dir}:"*) ;;
  *)
    echo "Add ${install_dir} to PATH to run 'alfredo' from anywhere."
    ;;
esac
