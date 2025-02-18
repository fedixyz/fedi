#!/usr/bin/env bash

set -euo pipefail

# this is needed to be able to use this script from both nix develop and nix build
REPO_ROOT=${REPO_ROOT:-$(pwd)}

source "$REPO_ROOT/scripts/common.sh"

"$REPO_ROOT/scripts/enforce-nix.sh"

args=()

case $CARGO_PROFILE in
  release)
    args+=("--release")
    ;;
  *)
    args+=("--dev")
    ;;
esac

# needs to go into sub-target, otherwise it would invalidate everyting in main target
export CARGO_BUILD_TARGET_DIR="$CARGO_BUILD_TARGET_DIR/pkgs/wasm-pack"

# wasm-pack/cargo doesn't like being homeless
if [ -z "$HOME" ] || [ ! -e "$HOME" ]; then
  export HOME=/tmp
fi

# note: --out-dir is relative, so this doesn't control anything
pack_out="$CARGO_BUILD_TARGET_DIR/wasm-pack-out"

wasm-pack build bridge/fedi-wasm --target web --out-dir "$pack_out" "${args[@]}" "$@"

# replace broken import
sed "s|imports\['env'\] \= \_\_wbg_star0;|imports['env'] = { GFp_poly1305_init: () => { throw Error('Ring library not available') }, GFp_poly1305_update: () => { throw Error('Ring library not available') }, GFp_poly1305_finish: () => { throw Error('Ring library not available') }, GFp_memcmp: () => { throw Error('Ring library not available') } };|g" -i "$pack_out/fedi_wasm.js"

if [ -n "${FEDI_INSTALL_IN_NIX_OUT:-}" ]; then
  # defined by Nix derivation outside
  export out
  # copy artifacts to $out so the UI code can find them
  mkdir -p "$out/share/wasm"
  cp "$pack_out/"*.{ts,js,wasm} "$out/share/wasm"
fi
