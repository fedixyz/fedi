#!/usr/bin/env bash
# =============================================================================
# file-gatherer.sh - gathers changes in one file from origin onto a local branch
#
# Usage:
#   ./file-gatherer.sh [OPTIONS]
#
# Options:
#   -f, --file <path>        File to search for changes (required)
#   -t, --target <branch>    Local branch to cherry-pick onto (required).
#                            Created automatically if it does not exist.
#   -s, --stale-days <n>     Branches with no activity in the last N days are
#                            considered stale and skipped (default: 30)
#   -r, --remote <name>      Remote name to fetch branches from (default: origin)
#   -d, --dry-run            Show what would happen without making any changes
#   -h, --help               Print this help message
#
# Example:
#   ./file-gatherer.sh --file src/config.json --target main --stale-days 60
# =============================================================================

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log()      { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success()  { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()     { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()    { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
section()  { echo -e "\n${BOLD}$*${RESET}"; echo "────────────────────────────────────────"; }

# ── Defaults ─────────────────────────────────────────────────────────────────
SEARCH_FILE=""
TARGET_BRANCH=""
STALE_DAYS=30
REMOTE="origin"
DRY_RUN=false

SKIPPED_BRANCHES=()   # branches skipped due to a SEARCH_FILE conflict
PICKED_COMMITS=()     # "branch:sha" entries that were successfully applied

# ── Argument parsing ──────────────────────────────────────────────────────────
usage() {
  sed -n '/^# Usage/,/^# =/{ /^# =/d; s/^# \{0,3\}//; p }' "$0"
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--file)        SEARCH_FILE="$2";    shift 2 ;;
    -t|--target)      TARGET_BRANCH="$2";  shift 2 ;;
    -s|--stale-days)  STALE_DAYS="$2";     shift 2 ;;
    -r|--remote)      REMOTE="$2";         shift 2 ;;
    -d|--dry-run)     DRY_RUN=true;        shift   ;;
    -h|--help)        usage ;;
    *) error "Unknown option: $1"; usage ;;
  esac
done

# ── Validation ────────────────────────────────────────────────────────────────
[[ -z "$SEARCH_FILE" ]]   && { error "--file is required.";   exit 1; }
[[ -z "$TARGET_BRANCH" ]] && { error "--target is required."; exit 1; }

# Normalise path: strip a leading "./" so all git commands receive a
# repo-root-relative path (git log accepts "./" but diff-tree does not).
SEARCH_FILE="${SEARCH_FILE#./}"

git rev-parse --git-dir &>/dev/null || { error "Not inside a git repository."; exit 1; }

is_uint() { [[ "$1" =~ ^[0-9]+$ ]]; }
is_uint "$STALE_DAYS" || { error "--stale-days must be a non-negative integer."; exit 1; }

# ── Helpers ───────────────────────────────────────────────────────────────────

# Epoch timestamp of "N days ago" (handles macOS BSD date and GNU date).
stale_cutoff() {
  if date -v-"${STALE_DAYS}"d +%s &>/dev/null; then
    date -v-"${STALE_DAYS}"d +%s
  else
    date -d "${STALE_DAYS} days ago" +%s
  fi
}

# List non-stale remote branches (excluding HEAD and the target branch).
list_candidate_branches() {
  local cutoff
  cutoff=$(stale_cutoff)

  git fetch --prune "$REMOTE" 2>/dev/null || warn "git fetch failed; using cached remote refs."

  git for-each-ref \
      --format='%(refname:short) %(committerdate:unix)' \
      "refs/remotes/${REMOTE}/" \
    | while read -r ref ts; do
        [[ "$ref" == "${REMOTE}/HEAD" ]]             && continue
        [[ "$ref" == "${REMOTE}/${TARGET_BRANCH}" ]] && continue
        (( ts < cutoff ))                             && continue
        echo "$ref"
      done
}

# Oldest-first list of commits on $1 that add or modify lines in SEARCH_FILE,
# relative to TARGET_REF. Pure-deletion commits are excluded.
commits_touching_file() {
  local branch="$1"

  # --diff-filter=AM: Added or Modified only (excludes pure deletions).
  git log \
      --no-merges \
      --format="%H" \
      --diff-filter=AM \
      "${TARGET_REF}".."$branch" \
      -- "$SEARCH_FILE" \
    | while IFS= read -r sha; do
        # diff-tree --numstat outputs "<added>\t<deleted>\t<file>" with no
        # commit header, so $1 is reliably the added-lines count.
        local added
        added=$(git diff-tree --no-commit-id -1 --numstat "$sha" -- "$SEARCH_FILE" \
                  | awk 'NR==1{ print ($1+0) }')
        (( added > 0 )) && echo "$sha"
      done \
    | tac   # oldest-first so cherry-picks apply in order
}

# ── Pre-flight ────────────────────────────────────────────────────────────────
section "Cherry-pick file changes → ${TARGET_BRANCH}"
log "Search file : ${SEARCH_FILE}"
log "Target      : ${TARGET_BRANCH}"
log "Stale after : ${STALE_DAYS} days"
log "Remote      : ${REMOTE}"
$DRY_RUN && warn "DRY-RUN mode — no changes will be committed."

# Ensure the local target branch exists, then switch to it (skip in dry-run).
if ! $DRY_RUN; then
  if git show-ref --verify --quiet "refs/heads/${TARGET_BRANCH}"; then
    log "Local branch '${TARGET_BRANCH}' exists; checking it out."
    git checkout "$TARGET_BRANCH"
  else
    if git show-ref --verify --quiet "refs/remotes/${REMOTE}/${TARGET_BRANCH}"; then
      log "Creating local branch '${TARGET_BRANCH}' from '${REMOTE}/${TARGET_BRANCH}'."
      git checkout -b "$TARGET_BRANCH" "${REMOTE}/${TARGET_BRANCH}"
    else
      warn "No remote tracking ref found for '${TARGET_BRANCH}'. Creating local branch from current HEAD."
      git checkout -b "$TARGET_BRANCH"
    fi
  fi
fi

# Resolve the ref to use as "target" during the scan. In live mode this is
# the branch we just checked out; in dry-run we fall back to whatever exists.
if git show-ref --verify --quiet "refs/heads/${TARGET_BRANCH}"; then
  TARGET_REF="$TARGET_BRANCH"
elif git show-ref --verify --quiet "refs/remotes/${REMOTE}/${TARGET_BRANCH}"; then
  TARGET_REF="${REMOTE}/${TARGET_BRANCH}"
  $DRY_RUN && warn "Scanning against ${TARGET_REF} (no local target branch present)."
else
  TARGET_REF="HEAD"
  $DRY_RUN && warn "Scanning against HEAD (target branch does not exist anywhere)."
fi

# ── Phase 1: scan every branch, build the full plan ───────────────────────────
section "Scanning branches"

mapfile -t CANDIDATES < <(list_candidate_branches)

if [[ ${#CANDIDATES[@]} -eq 0 ]]; then
  warn "No non-stale candidate branches found. Nothing to do."
  exit 0
fi

log "Inspecting ${#CANDIDATES[@]} candidate branch(es)…"

# Parallel arrays. SCAN_COMMITS[i] is a space-separated list of SHAs for
# SCAN_BRANCHES[i].
SCAN_BRANCHES=()
SCAN_COMMITS=()
TOTAL_COMMITS=0

for branch in "${CANDIDATES[@]}"; do
  local_name="${branch#"${REMOTE}/"}"
  mapfile -t commits < <(commits_touching_file "$branch")
  if [[ ${#commits[@]} -eq 0 ]]; then
    continue
  fi
  log "  ${local_name}: ${#commits[@]} commit(s) touch '${SEARCH_FILE}'"
  SCAN_BRANCHES+=("$local_name")
  SCAN_COMMITS+=("${commits[*]}")
  (( TOTAL_COMMITS += ${#commits[@]} ))
done

if [[ ${#SCAN_BRANCHES[@]} -eq 0 ]]; then
  warn "No relevant commits found on any candidate branch. Nothing to do."
  exit 0
fi

log "Plan: ${TOTAL_COMMITS} commit(s) across ${#SCAN_BRANCHES[@]} branch(es)."

# ── Phase 2: cherry-pick ──────────────────────────────────────────────────────
section "Cherry-picking"

if $DRY_RUN; then
  for ((i=0; i<${#SCAN_BRANCHES[@]}; i++)); do
    local_name="${SCAN_BRANCHES[i]}"
    read -ra commits <<< "${SCAN_COMMITS[i]}"
    for sha in "${commits[@]}"; do
      msg=$(git log -1 --format="%s" "$sha")
      log "  [dry-run] ${local_name}: ${sha:0:8}  \"${msg}\""
    done
  done
else
  for ((i=0; i<${#SCAN_BRANCHES[@]}; i++)); do
    local_name="${SCAN_BRANCHES[i]}"
    read -ra commits <<< "${SCAN_COMMITS[i]}"

    log "Branch ${local_name}: applying ${#commits[@]} commit(s)."
    branch_aborted=false

    for sha in "${commits[@]}"; do
      short="${sha:0:8}"
      msg=$(git log -1 --format="%s" "$sha")
      log "  Cherry-picking ${short}  \"${msg}\""

      # Clean apply — done.
      if git cherry-pick "$sha"; then
        success "  Applied ${short} cleanly."
        PICKED_COMMITS+=("${local_name}:${short}")
        continue
      fi

      # Cherry-pick produced conflicts. Inspect the unmerged paths.
      mapfile -t CONFLICTED < <(git diff --name-only --diff-filter=U)

      # If SEARCH_FILE is among them, abort this branch entirely and move on.
      search_file_conflicted=false
      for cf in "${CONFLICTED[@]}"; do
        if [[ "$cf" == "$SEARCH_FILE" ]]; then
          search_file_conflicted=true
          break
        fi
      done

      if $search_file_conflicted; then
        warn "  Conflict in '${SEARCH_FILE}' — aborting and skipping ${local_name}."
        git cherry-pick --abort
        SKIPPED_BRANCHES+=("$local_name")
        branch_aborted=true
        break
      fi

      # Otherwise, force-resolve every conflicted path. We don't care about
      # the resulting code — we only need a committable tree.
      for cf in "${CONFLICTED[@]}"; do
        log "    Auto-resolving conflict in: ${cf}"
        if git checkout --theirs -- "$cf" 2>/dev/null; then
          # "Both modified", "deleted by us", "both added", etc.
          git add -- "$cf"
        else
          # "Deleted by them" / "both deleted" — no theirs version exists.
          git rm -f -- "$cf" >/dev/null 2>&1 || true
        fi
      done

      # Sanity check: anything still unmerged would cause --continue to fail.
      if [[ -n "$(git diff --name-only --diff-filter=U)" ]]; then
        warn "  Unexpected unresolved paths after auto-resolution; aborting ${local_name}."
        git cherry-pick --abort 2>/dev/null || true
        SKIPPED_BRANCHES+=("${local_name} (unresolvable)")
        branch_aborted=true
        break
      fi

      # Commit the resolved cherry-pick. GIT_EDITOR=true guarantees no editor
      # opens even in environments where --no-edit behaves unexpectedly.
      if GIT_EDITOR=true git cherry-pick --continue --no-edit; then
        success "  Applied ${short} after auto-resolving unrelated conflicts."
        PICKED_COMMITS+=("${local_name}:${short}")
      else
        warn "  Could not finalise ${short}; aborting ${local_name}."
        git cherry-pick --abort 2>/dev/null || true
        SKIPPED_BRANCHES+=("${local_name} (finalise error)")
        branch_aborted=true
        break
      fi
    done

    $branch_aborted && log "Moving on to next branch."
  done
fi

# ── Summary ───────────────────────────────────────────────────────────────────
section "Summary"

if [[ ${#PICKED_COMMITS[@]} -gt 0 ]]; then
  success "Successfully cherry-picked ${#PICKED_COMMITS[@]} commit(s):"
  for entry in "${PICKED_COMMITS[@]}"; do
    echo "  ✓  ${entry}"
  done
else
  log "No commits were cherry-picked."
fi

if [[ ${#SKIPPED_BRANCHES[@]} -gt 0 ]]; then
  echo
  warn "Skipped ${#SKIPPED_BRANCHES[@]} branch(es) due to conflicts in '${SEARCH_FILE}':"
  for b in "${SKIPPED_BRANCHES[@]}"; do
    echo "  ✗  ${b}"
  done
  exit 2   # non-zero so CI pipelines can detect partial runs
fi

exit 0
