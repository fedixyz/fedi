# shellcheck shell=bash
# This script should be sourced, not run directly.

# Raise this process's soft file descriptor limit when possible. Dev-shell
# callers pass "dev-shell" so direnv gets actionable guidance instead: rlimit
# changes made while evaluating an envrc cannot propagate to its parent shell.
function ensure_fd_limit() {
  local minimum="${1:-10000}"
  local context="${2:-process}"
  local soft_limit
  local hard_limit

  soft_limit=$(ulimit -Sn)
  if [ "$soft_limit" = "unlimited" ] || [ "$soft_limit" -ge "$minimum" ]; then
    return
  fi

  hard_limit=$(ulimit -Hn)
  if [ "$context" = "dev-shell" ] && [ -n "${DIRENV_IN_ENVRC:-}" ]; then
    >&2 echo "⚠️  File descriptor soft limit is $soft_limit, below the required $minimum."
    if [ "$hard_limit" = "unlimited" ] || [ "$hard_limit" -ge "$minimum" ]; then
      >&2 echo "   direnv cannot change its parent shell's limits; run 'ulimit -Sn $minimum' in the parent shell and reload direnv."
    else
      >&2 echo "   The hard limit is only $hard_limit. Raise it in your login/session configuration, then reload direnv."
    fi
    return
  fi

  if ulimit -Sn "$minimum" 2>/dev/null; then
    >&2 echo "Raised file descriptor soft limit from $soft_limit to $minimum."
  else
    >&2 echo "⚠️  Could not raise file descriptor soft limit from $soft_limit to $minimum (hard limit: $hard_limit)."
    >&2 echo "   Raise the hard limit in your login/session configuration, then try again."
  fi
}
