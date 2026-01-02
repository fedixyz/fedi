#!/usr/bin/env bash
#
# relay-commits.sh
# Relays commits from a private repository to a public repository with author filtering.
#
# Usage: ./relay-commits.sh --publish-token PAT [OPTIONS]
#

set -euo pipefail

# Configuration
DOWNLOAD_TOKEN="${DOWNLOAD_TOKEN:-}"
PUBLISH_TOKEN="${PUBLISH_TOKEN:-}"
PUBLIC_FEDI_ORG="${PUBLIC_FEDI_ORG:-}"
PUBLIC_FEDI_REPO="${PUBLIC_FEDI_REPO:-}"
PLACEHOLDER_NAME="${PLACEHOLDER_NAME:-Fedi CI}"
PLACEHOLDER_EMAIL="${PLACEHOLDER_EMAIL:-ci@fedi.xyz}"
TARGET_BRANCH="${TARGET_BRANCH:-master}"
DRY_RUN=false

# Optional override parameters
OVERRIDE_SOURCE_BRANCH=""
OVERRIDE_START_COMMIT=""

# Allowed authors (comma-separated author names)
ALLOWED_AUTHORS="${ALLOWED_AUTHORS:-}"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --dl-token)
            DOWNLOAD_TOKEN="$2"
            shift 2
            ;;
        --publish-token)
            PUBLISH_TOKEN="$2"
            shift 2
            ;;
        --target-branch)
            TARGET_BRANCH="$2"
            shift 2
            ;;
        --allowed-authors)
            ALLOWED_AUTHORS="$2"
            shift 2
            ;;
        --placeholder-name)
            PLACEHOLDER_NAME="$2"
            shift 2
            ;;
        --placeholder-email)
            PLACEHOLDER_EMAIL="$2"
            shift 2
            ;;
        --source-branch)
            OVERRIDE_SOURCE_BRANCH="$2"
            shift 2
            ;;
        --start-commit)
            OVERRIDE_START_COMMIT="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Required Options:"
            echo "  --dl-token PAT         GitHub PAT to download source repo"
            echo "  --publish-token PAT    GitHub PAT with push access to the target repo"
            echo ""
            echo "Optional:"
            echo "  --dry-run              Do not push changes"
            echo "  --target-branch NAME   Target branch name (default: master)"
            echo "  --allowed-authors LIST Comma-separated list of allowed author names (unused)"
            echo "  --placeholder-name     Placeholder author name (default: Test CI)"
            echo "  --placeholder-email    Placeholder author email (default: ci@test.xyz)"
            echo ""
            echo "Override Options (for recovery):"
            echo "  --source-branch NAME   Override source branch to relay from"
            echo "  --start-commit SHA     Override starting commit SHA on source branch"
            echo ""
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Validate required inputs
if [[ -z "$PUBLISH_TOKEN" ]]; then
    echo "❌ Error: --publish-token is required"
    exit 1
fi

# Create temporary directory
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

echo "📁 Working directory: $WORK_DIR"

# Clone or copy repository
source_repo="fedibtc/fedi"
if [[ -n "$DOWNLOAD_TOKEN" ]]; then
    echo "➡️ Cloning from $source_repo..."
    git clone --no-local  "https://$DOWNLOAD_TOKEN@github.com/$source_repo.git" "$WORK_DIR/source"
else
    echo "➡️ Cloning from current directory..."
    git clone --no-local . "$WORK_DIR/source"
fi

# Clone target repository
target_repo="${PUBLIC_FEDI_ORG}/${PUBLIC_FEDI_REPO}"
echo ""
echo "➡️ Cloning target repository: $target_repo..."
git clone --no-local "https://$PUBLISH_TOKEN@github.com/$target_repo.git" "$WORK_DIR/target"

# Prepare allowed authors list
# echo "$ALLOWED_AUTHORS" | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$' > "$WORK_DIR/allowed_authors.txt" || true

# echo ""
# echo "📋 Allowed authors:"
# cat "$WORK_DIR/allowed_authors.txt"

# Function to check if author name is allowed
# is_allowed_author() {
#     local name="$1"
#     local name_lower="${name,,}"

#     local allowed
#     local allowed_lower
#     while IFS= read -r allowed; do
#         [[ -z "$allowed" ]] && continue
#         allowed_lower="${allowed,,}"
#         if [[ "$name_lower" == "$allowed_lower" ]]; then
#             return 0
#         fi
#     done < "$WORK_DIR/allowed_authors.txt"
#     return 1
# }

# Function to extract source commit from message
extract_source_commit() {
    echo "$1" | grep -oE '^source commit: [a-f0-9]+$' | tail -1 | sed 's/source commit: //'
}

# Navigate to target and checkout branch
cd "$WORK_DIR/target"
git checkout "$TARGET_BRANCH" 2>/dev/null || {
    echo "❌ Error: Target branch '$TARGET_BRANCH' does not exist"
    exit 1
}

# Determine source branch and starting commit
SOURCE_BRANCH="master"
START_COMMIT=""

if [[ -n "$OVERRIDE_SOURCE_BRANCH" ]] && [[ -n "$OVERRIDE_START_COMMIT" ]]; then
    echo ""
    echo "🔧 Using override parameters:"
    echo "   Source branch: $OVERRIDE_SOURCE_BRANCH"
    echo "   Start commit: $OVERRIDE_START_COMMIT"
    SOURCE_BRANCH="$OVERRIDE_SOURCE_BRANCH"
    START_COMMIT="$OVERRIDE_START_COMMIT"
elif [[ -n "$OVERRIDE_SOURCE_BRANCH" ]] || [[ -n "$OVERRIDE_START_COMMIT" ]]; then
    echo "❌ Error: Both --source-branch and --start-commit must be provided together"
    exit 1
else
    echo ""
    echo "🔍 Reading source commit reference from target HEAD..."

    TARGET_HEAD_MESSAGE=$(git log -1 --format='%B' HEAD)
    START_COMMIT=$(extract_source_commit "$TARGET_HEAD_MESSAGE")

    if [[ -z "$START_COMMIT" ]]; then
        echo "❌ Error: No 'source commit: <sha>' found in target HEAD"
        echo ""
        echo "To resolve, restart with: --source-branch <branch> --start-commit <sha>"
        exit 1
    fi

    echo "   Found: $START_COMMIT"
fi

# Validate source repository
cd "$WORK_DIR/source"
git checkout "$SOURCE_BRANCH" 2>/dev/null || {
    echo "❌ Error: Source branch '$SOURCE_BRANCH' does not exist"
    exit 1
}

git rev-parse --verify "$START_COMMIT^{commit}" >/dev/null 2>&1 || {
    echo "❌ Error: Start commit '$START_COMMIT' not found in source"
    exit 1
}

# If START_COMMIT was auto-detected, verify it belongs to the source branch
if [[ -z "$OVERRIDE_SOURCE_BRANCH" ]]; then
    if ! git merge-base --is-ancestor "$START_COMMIT" "$SOURCE_BRANCH" 2>/dev/null; then
        echo "❌ Error: Detected start commit '$START_COMMIT' is not on branch '$SOURCE_BRANCH'"
        echo ""
        echo "To resolve, restart with: --source-branch <branch> --start-commit <sha>"
        exit 1
    fi
fi

# Get commits to relay (first-parent only for merge commits)
echo ""
echo "📊 Analyzing commits..."
COMMITS_TO_RELAY=$(git rev-list --ancestry-path --reverse --first-parent "${START_COMMIT}..HEAD")

if [[ -z "$COMMITS_TO_RELAY" ]]; then
    echo "✅ No new commits to relay. Already up to date."
    exit 0
fi

COMMIT_COUNT=$(echo "$COMMITS_TO_RELAY" | wc -l | tr -d ' ')
echo "   Found $COMMIT_COUNT commits to relay"

# Process commits
cd "$WORK_DIR/target"
git remote add source "$WORK_DIR/source"
git fetch source "$SOURCE_BRANCH"

RELAYED=0

while IFS= read -r commit_sha; do
    [[ -z "$commit_sha" ]] && continue

    echo ""
    echo "📦 Processing: ${commit_sha:0:7}"

    # Get commit info from source
    cd "$WORK_DIR/source"

    AUTHOR_NAME=$(git log -1 --format='%an' "$commit_sha")
    AUTHOR_EMAIL=$(git log -1 --format='%ae' "$commit_sha")
    AUTHOR_DATE=$(git log -1 --format='%aI' "$commit_sha")
    COMMIT_MSG=$(git log -1 --format='%B' "$commit_sha")
    SOURCE_TREE=$(git rev-parse "${commit_sha}^{tree}")

    # Filter author
    # if ! is_allowed_author "$AUTHOR_NAME"; then
    #     AUTHOR_NAME="$PLACEHOLDER_NAME"
    #     AUTHOR_EMAIL="$PLACEHOLDER_EMAIL"
    # fi

    # Append source commit reference
    COMMIT_MSG="${COMMIT_MSG%$'\n'}"
    COMMIT_MSG="$COMMIT_MSG

source commit: $commit_sha"

    cd "$WORK_DIR/target"

    # Check for changes
    CURRENT_TREE=$(git rev-parse "HEAD^{tree}")
    if [[ "$SOURCE_TREE" == "$CURRENT_TREE" ]]; then
        echo "   ⏭️  No changes, skipping"
        continue
    fi

    # Apply the tree state
    if ! git read-tree -u --reset "$SOURCE_TREE" 2>/dev/null; then
        echo "❌ Error: Conflict while applying ${commit_sha:0:7}"
        echo "   Manual resolution required."
        exit 1
    fi

    git add -A

    if git diff --cached --quiet; then
        echo "   ⏭️  No effective changes, skipping"
        continue
    fi

    # Create commit
    GIT_AUTHOR_NAME="$AUTHOR_NAME" \
    GIT_AUTHOR_EMAIL="$AUTHOR_EMAIL" \
    GIT_AUTHOR_DATE="$AUTHOR_DATE" \
    GIT_COMMITTER_NAME="$PLACEHOLDER_NAME" \
    GIT_COMMITTER_EMAIL="$PLACEHOLDER_EMAIL" \
    git commit -m "$COMMIT_MSG"

    echo "   ✅ Created: $(git rev-parse --short HEAD)"
    ((++RELAYED))

done <<< "$COMMITS_TO_RELAY"

echo ""
echo "📊 Relayed $RELAYED commits"

# Push
if [[ "$DRY_RUN" == true ]]; then
    echo ""
    echo "🔍 DRY RUN: Would push to $target_repo:$TARGET_BRANCH"
    echo ""
    git log --oneline -10
else
    echo ""
    echo "⬆️ Pushing to $target_repo..."

    git remote set-url origin "https://$PUBLISH_TOKEN@github.com/$target_repo.git"

    if ! git push origin "$TARGET_BRANCH"; then
        echo "❌ Error: Push failed"
        exit 1
    fi

    echo "✅ Push successful"
fi

echo ""
echo "✅ Done!"
