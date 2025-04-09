#!/usr/bin/env bash

set -euo pipefail

source scripts/common.sh


# prevent locale settings messing with some setups
export LANG=C

if [ "$(ulimit -Sn)" -lt "10000" ]; then
  >&2 echo "⚠️  ulimit too small. Running 'ulimit -Sn 10000' to avoid problems running tests"
  ulimit -Sn 10000
fi

# https://stackoverflow.com/a/72183258/134409
# this hangs in CI (no tty?)
# yes 'will cite' | parallel --citation 2>/dev/null 1>/dev/null || true
if [ -n "${HOME:-}" ] && [ -d "$HOME" ]; then
  mkdir -p "$HOME/.parallel"
  touch "$HOME/.parallel/will-cite"
fi

# Avoid re-building workspace in parallel in all test derivations
# Note: Respect 'CARGO_PROFILE' that crane uses
>&2 echo "Pre-building workspace..."
runLowPrio cargo build ${CARGO_PROFILE:+--profile ${CARGO_PROFILE}}  --all-targets
# Avoid re-building tests in parallel in all test derivations
>&2 echo "Pre-building tests..."
runLowPrio cargo nextest run --no-run ${CARGO_PROFILE:+--cargo-profile ${CARGO_PROFILE}} ${CARGO_PROFILE:+--profile ${CARGO_PROFILE}} --all-targets

# We've just built everything there is to built, so we should not have a
# need to be build things again from now on, but since cargo does not
# let us enforce it, we need to go behind its back. We put a fake 'rustc'
# in the PATH.
# If you really need to break this rule, ping dpc
export CARGO_DENY_COMPILATION=1

function rust_unit_tests() {
  # unit tests don't use binaries from old versions, so there's no need to run for backwards-compatibility tests
  if [ -z "${FM_BACKWARDS_COMPATIBILITY_TEST:-}" ]; then
    fm-run-test "${FUNCNAME[0]}" cargo nextest run ${CARGO_PROFILE:+--cargo-profile ${CARGO_PROFILE}} ${CARGO_PROFILE:+--profile ${CARGO_PROFILE}} --workspace --all-targets
  fi
}
export -f rust_unit_tests

function test_fm_cli_tests() {
  fm-run-test "${FUNCNAME[0]}" ./scripts/test-fm-upstream-tests.sh cli-tests
}
export -f test_fm_cli_tests

function test_fm_load_tests() {
  export PATH="${FEDIMINT_LOAD_TEST_TOOL_NIX_PKG}/bin:$PATH"
  fm-run-test "${FUNCNAME[0]}" ./scripts/test-fm-upstream-tests.sh load-test-tool-test
}
export -f test_fm_load_tests

function test_stability_pool() {
  fm-run-test "${FUNCNAME[0]}" ./scripts/test-stability-pool.sh
}
export -f test_stability_pool

function test_stability_pool_v2() {
  fm-run-test "${FUNCNAME[0]}" ./scripts/test-stability-pool-v2.sh
}
export -f test_stability_pool_v2

function test_bridge_current() {
  fm-run-test "${FUNCNAME[0]}" ./scripts/test-bridge-current.sh
}
export -f test_bridge_current

function test_bridge_current_use_upstream_fedimintd() {
  USE_UPSTREAM_FEDIMINTD=1 fm-run-test "${FUNCNAME[0]}" ./scripts/test-bridge-current.sh
}
export -f test_bridge_current_use_upstream_fedimintd

tests_to_run_in_parallel=()
for _ in $(seq "${FM_TEST_CI_ALL_TIMES:-1}"); do
# NOTE: try to keep the slowest tests first, except 'always_success_test',
# as it's used for failure test
tests_to_run_in_parallel+=(
  test_fm_cli_tests
  test_fm_load_tests
  test_stability_pool_v2
  test_stability_pool
  test_bridge_current
  test_bridge_current_use_upstream_fedimintd
)
done


parsed_test_commands=$(printf "%s\n" "${tests_to_run_in_parallel[@]}")

parallel_args=()

if [ -z "${CI:-}" ] && [[ -t 1 ]] && [ -z "${FM_TEST_CI_ALL_DISABLE_ETA:-}" ]; then
  parallel_args+=(--eta)
fi

if [ -n "${FM_TEST_CI_ALL_JOBS:-}" ]; then
  # when specifically set, use the env var
  parallel_args+=(--jobs "${FM_TEST_CI_ALL_JOBS}")
elif [ -n "${CI:-}" ] || [ "${CARGO_PROFILE:-}" == "ci" ]; then
  parallel_args+=(--jobs $(($(nproc) / 2 + 1)))
else
  # on dev computers default to `num_cpus / 2 + 1` max parallel jobs
  parallel_args+=(--jobs "${FM_TEST_CI_ALL_JOBS:-$(($(nproc) / 2 + 1))}")
fi

parallel_args+=(--timeout "${FM_TEST_CI_ALL_TIMEOUT:-300}")

parallel_args+=(--load "${FM_TEST_CI_ALL_MAX_LOAD:-$(($(nproc) / 3 + 1))}")
# --delay to let nix start extracting and bump the load
# usually not needed, as '--jobs' will keep a cap on the load anyway
parallel_args+=(--delay "${FM_TEST_CI_ALL_DELAY:-0}")

tmpdir=$(mktemp --tmpdir -d XXXXX)
trap 'rm -r $tmpdir' EXIT
joblog="$tmpdir/joblog"

PATH="$(pwd)/scripts/dev/run-test/:$PATH"

parallel_args+=(
  --halt-on-error 1
  --joblog "$joblog"
  --noswap
  --memfree 2G
)

>&2 echo "## Starting all tests in parallel..."
>&2 echo "parallel ${parallel_args[*]}"

# --memfree to make sure tests have enough memory to run
# --nice to let you browse twitter without lag while the tests are running
echo "$parsed_test_commands" | if parallel \
  "${parallel_args[@]}" ; then
  >&2 echo "All tests successful"
else
  >&2 echo "Some tests failed:"
  awk '{ if($7 != "0") print $0 "\n" }' < "$joblog"
  >&2 echo "Search for '## FAIL' to find the end of the failing test"
  exit 1
fi
