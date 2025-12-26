#!/bin/bash
# Sync android/ folder to ZEKEapp repository as a new branch
# This script uses git subtree to extract the android/ folder and push it
# to the ZEKEapp repo with android/ as the root directory

set -e

# Configuration from environment
GITHUB_TOKEN="${ZEKEAPP_GITHUB_TOKEN}"
REPO_URL="${ZEKEAPP_REPO_URL}"
BRANCH_NAME="${1:-companion-app}"
SOURCE_DIR="android"

# Validate environment
if [ -z "$GITHUB_TOKEN" ]; then
  echo "Error: ZEKEAPP_GITHUB_TOKEN not set"
  exit 1
fi

if [ -z "$REPO_URL" ]; then
  echo "Error: ZEKEAPP_REPO_URL not set"
  exit 1
fi

# Build authenticated URL
# Handle both https://github.com/user/repo.git and https://github.com/user/repo formats
AUTH_URL=$(echo "$REPO_URL" | sed "s|https://|https://${GITHUB_TOKEN}@|")

echo "=== ZEKEapp Sync Script ==="
echo "Branch: $BRANCH_NAME"
echo "Source: $SOURCE_DIR/"
echo ""

# Ensure we're in the repo root
cd "$(git rev-parse --show-toplevel)"

# Check if android directory exists
if [ ! -d "$SOURCE_DIR" ]; then
  echo "Error: $SOURCE_DIR directory not found"
  exit 1
fi

echo "Step 1: Creating subtree split from $SOURCE_DIR/..."
# Split the android/ folder into a new branch, preserving history for files in that folder
git subtree split --prefix="$SOURCE_DIR" -b "subtree-split-temp" 2>/dev/null || {
  # If branch exists, delete and recreate
  git branch -D "subtree-split-temp" 2>/dev/null || true
  git subtree split --prefix="$SOURCE_DIR" -b "subtree-split-temp"
}

echo "Step 2: Pushing to ZEKEapp repository..."
# Push the split branch to the ZEKEapp repo
git push "$AUTH_URL" "subtree-split-temp:$BRANCH_NAME" --force

echo "Step 3: Cleaning up temporary branch..."
git branch -D "subtree-split-temp"

echo ""
echo "=== Sync Complete ==="
echo "The $SOURCE_DIR/ folder has been pushed to:"
echo "  Repository: $REPO_URL"
echo "  Branch: $BRANCH_NAME"
echo ""
echo "The branch contains only the contents of $SOURCE_DIR/ as the root."
