#!/usr/bin/env bash

set -e

if [ -z "${IN_NIX_SHELL:-}" ]; then
  >&2 echo "Workaround: restart in 'nix develop' shell"
  exec nix develop --command "$0" "$@"
fi
