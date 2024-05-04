#!/usr/bin/env bash

set -e

if [ -z "${IN_NIX_SHELL:-}" ]; then
  >&2 echo "Workaround: restart in 'nix develop .#lint' shell"
  exec nix develop .#lint --command "$0" "$@"
fi
