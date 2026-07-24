#!/usr/bin/env bash
if ! flakebox lint --silent; then
  >&2 echo "ℹ️  Project recommendations detected. Run 'flakebox lint' for more info."
fi

if [[ "$-" == *i* ]] && [[ -t 2 ]] && [ -n "${DIRENV_IN_ENVRC:-}" ]; then
  # and not set DIRENV_LOG_FORMAT
  if [ -n "${DIRENV_LOG_FORMAT:-}" ]; then
    >&2 echo "💡 Set 'DIRENV_LOG_FORMAT=\"\"' in your shell environment variables for a cleaner output of direnv"
  fi
fi

if [[ "$-" == *i* ]] && [[ -t 2 ]]; then
  >&2 echo "💡 Run 'just' for a list of available 'just ...' helper recipes"
fi
