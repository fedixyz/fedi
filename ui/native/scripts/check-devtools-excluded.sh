#!/usr/bin/env bash
# Fails if anything under native/devtools reaches a release bundle.
# The dev bundle is checked too, so a broken grep cannot pass by accident.
set -euo pipefail
cd "$(dirname "$0")/.."
out=$(mktemp -d)
pattern='FiSimulator|devtools/fi|developer/WalletServiceDevTools|attachFiDevTools'

metro_config_args=()
if [ -n "${METRO_CONFIG:-}" ]; then
  metro_config_args=(--config "$METRO_CONFIG")
fi

npx react-native bundle --platform ios --dev false --entry-file index.js \
  --bundle-output "$out/release.jsbundle" --minify false \
  "${metro_config_args[@]+"${metro_config_args[@]}"}" >/dev/null
npx react-native bundle --platform ios --dev true --entry-file index.js \
  --bundle-output "$out/dev.jsbundle" \
  "${metro_config_args[@]+"${metro_config_args[@]}"}" >/dev/null

release_hits=$(grep -c -E "$pattern" "$out/release.jsbundle" || true)
dev_hits=$(grep -c -E "$pattern" "$out/dev.jsbundle" || true)
rm -rf "$out"

if [ "$dev_hits" -eq 0 ]; then
  echo "check is broken: dev bundle has no devtools references" >&2
  exit 2
fi
if [ "$release_hits" -ne 0 ]; then
  echo "release bundle contains $release_hits devtools references" >&2
  exit 1
fi
echo "release bundle clean, dev bundle has $dev_hits devtools references"
