#!/usr/bin/env bash

set -euo pipefail

apk_path="$1"
git_hash="$2"

if [ ! -e "$apk_path" ]; then
  >&2 echo "Apk path $apk_path doesn't exist"
  exit 1
fi

apk_extract_tmp="$(mktemp -d)"

on_exit() {
  rm -Rf "$apk_extract_tmp"
}
trap on_exit EXIT

nix run nixpkgs#apktool -- d -o "${apk_extract_tmp}" -f "${apk_path}" > /dev/null
hash_from_apk=$(nix shell nixpkgs#bintools --command strings "${apk_extract_tmp}/lib/arm64-v8a/libfediffi.so" | grep -oP 'bridge version hash=\K[[:xdigit:]]{40}')

if [ "${hash_from_apk}" != "${git_hash}" ]; then
  >&2 echo "Bridge hash in the apk does not match the source code"
  >&2 echo "${hash_from_apk} != ${git_hash}"
  exit 1
fi

rm -Rf apk_extract_tmp
