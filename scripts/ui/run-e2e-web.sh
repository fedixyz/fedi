#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)
"$REPO_ROOT/scripts/enforce-nix.sh"

E2E_DIR="$REPO_ROOT/ui/web"
default_web_e2e_port() {
  if [[ -n "${CI:-}" && "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ ]]; then
    echo $((30000 + (GITHUB_RUN_ID % 20000)))
  else
    echo 34157
  fi
}

WEB_E2E_PORT="${WEB_E2E_PORT:-$(default_web_e2e_port)}"
E2E_SCRIPT="test:e2e"
EXTRA_ARGS=()

usage() {
  echo "Usage: $0 [options]"
  echo ""
  echo "Options:"
  echo "  --headed     Run tests with a visible browser window"
  echo "  --debug      Run in Playwright debug mode (PWDEBUG inspector)"
  echo "  -h, --help   Show this help message"
  echo ""
  echo "Any extra arguments are forwarded to playwright test."
  echo ""
  echo "Examples:"
  echo "  $0                          # headless, all tests"
  echo "  $0 --headed                 # visible browser, all tests"
  echo "  $0 --debug                  # Playwright inspector"
  echo "  $0 -- --grep 'onboarding'   # only matching tests"
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --headed)
      E2E_SCRIPT="test:e2e:headed"
      shift
      ;;
    --debug)
      E2E_SCRIPT="test:e2e:debug"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      EXTRA_ARGS+=("$@")
      break
      ;;
    *)
      EXTRA_ARGS+=("$1")
      shift
      ;;
  esac
done

echo "=== Web E2E Test Runner ==="

# Install dependencies
"$REPO_ROOT/scripts/ui/build-deps.sh"
cd "$E2E_DIR"

if [[ "$(uname -s)" == "Linux" ]]; then
  if [[ -z "${PLAYWRIGHT_BROWSERS_PATH:-}" ]]; then
    echo "ERROR: PLAYWRIGHT_BROWSERS_PATH must be set by the Nix dev shell on Linux"
    exit 1
  fi
else
  npx playwright install chromium
fi

# Run the web workspace's e2e script, like run-integration-tests.sh
CMD_ARGS=("yarn" "$E2E_SCRIPT")
if [[ ${#EXTRA_ARGS[@]} -gt 0 ]]; then
  CMD_ARGS+=("--" "${EXTRA_ARGS[@]}")
fi

echo "Running: ${CMD_ARGS[*]}"
echo "Port: $WEB_E2E_PORT"
echo ""

export WEB_E2E_PORT
set +e
"${CMD_ARGS[@]}"
EXIT_CODE=$?
set -e

if [[ $EXIT_CODE -eq 0 ]]; then
  echo ""
  echo "To view the HTML report run:"
  echo "  cd ui/web && yarn playwright show-report"
fi

exit $EXIT_CODE
