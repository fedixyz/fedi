#!/usr/bin/env bash
set -euo pipefail

source scripts/common.sh

remote="${1:-upstream}"
branch="${2:-master}"

nix_system="$(nix eval --raw --impure --expr builtins.currentSystem)"

git fetch "$remote" "$branch"

repo="git+file:${REPO_ROOT}?ref=refs/remotes/$remote/$branch"
nix build "$repo#devShells.${nix_system}.default"
nix build "$repo#wasm32-unknown.ci.fedi-wasm-pack"
