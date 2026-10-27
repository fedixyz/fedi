#!/usr/bin/env bash

# Google Play requires 16 KB page-size support for all 64-bit native libs:
# every ELF LOAD segment must be aligned to at least 0x4000.
# https://github.com/fedibtc/fedi/issues/11187
set -euo pipefail

artifact_path="$1"

if [ ! -e "$artifact_path" ]; then
  >&2 echo "Artifact path $artifact_path doesn't exist"
  exit 1
fi

nix run nixpkgs#unzip -- -tq "$artifact_path"

extract_tmp="$(mktemp -d)"

on_exit() {
  rm -Rf "$extract_tmp"
}
trap on_exit EXIT

# APKs keep native libs under lib/<abi>/, AABs under base/lib/<abi>/.
# unzip exits non-zero for patterns with no matches, so tolerate it and rely
# on the zero-libs guard below instead.
nix run nixpkgs#unzip -- -q "$artifact_path" \
  "lib/arm64-v8a/*.so" "lib/x86_64/*.so" \
  "base/lib/arm64-v8a/*.so" "base/lib/x86_64/*.so" \
  -d "$extract_tmp" || true

checked=0
misaligned=()
while IFS= read -r so; do
  checked=$((checked + 1))
  min_align=""
  for align in $(nix shell nixpkgs#binutils-unwrapped --command readelf -lW "$so" | awk '$1 == "LOAD" { print $NF }'); do
    align=$((align))
    if [ -z "$min_align" ] || [ "$align" -lt "$min_align" ]; then
      min_align=$align
    fi
  done
  if [ -z "$min_align" ] || [ "$min_align" -lt 16384 ]; then
    misaligned+=("${so#"$extract_tmp"/}: LOAD alignment ${min_align:-none}")
  fi
done < <(find "$extract_tmp" -name "*.so" | sort)

if [ "$checked" -eq 0 ]; then
  >&2 echo "No 64-bit native libs found in $artifact_path; refusing to pass an empty check"
  exit 1
fi

if [ "${#misaligned[@]}" -gt 0 ]; then
  >&2 echo "Native libs without 16 KB page-size support (LOAD alignment < 16384):"
  printf >&2 '  %s\n' "${misaligned[@]}"
  exit 1
fi

echo "All $checked 64-bit native libs are 16 KB page-aligned"
