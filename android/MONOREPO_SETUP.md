# ZekeAssistant Monorepo Setup Guide

This guide explains how to set up ZekeAssistant as a unified monorepo with two-way sync to both original repositories (Zeke backend and ZEKEapp mobile).

## Overview

**Repository Structure:**
```
ZekeAssistant/
├── backend/          ← From Zeke repo (android/ EXCLUDED)
│   ├── client/       ← Web UI
│   ├── server/       ← Backend API
│   ├── python_agents/← AI agents
│   └── ...
│
├── mobile/           ← From ZEKEapp repo
│   ├── client/       ← Mobile app
│   ├── server/       ← Mobile proxy
│   └── ...
│
├── .gitignore        ← Excludes backend/android/
└── README.md
```

## CRITICAL: Privacy Protection

The `android/` folder in Zeke is private and must NEVER appear in ZekeAssistant's git history. Git subtrees commit ALL files, including those you later delete. This guide uses a safe two-step approach:

1. **ZEKEapp** → Uses standard Git subtree (no private content)
2. **Zeke** → Uses filtered rsync to exclude android/ BEFORE any commits

## Prerequisites

- Git installed on your local machine
- rsync installed (pre-installed on macOS/Linux, install via WSL on Windows)
- GitHub access to all three repositories:
  - https://github.com/Johnsonbros/ZekeAssistant (public)
  - https://github.com/Johnsonbros/Zeke (private)
  - https://github.com/Johnsonbros/ZEKEapp (public)

## One-Time Setup

Run these commands on your local machine:

```bash
# 1. Create a clean working directory
mkdir -p ~/zeke-monorepo-setup
cd ~/zeke-monorepo-setup

# 2. Clone ZekeAssistant
git clone https://github.com/Johnsonbros/ZekeAssistant.git
cd ZekeAssistant

# 3. Remove existing content (keeping .git)
find . -maxdepth 1 ! -name '.git' ! -name '.' -exec rm -rf {} +

# 4. Create .gitignore FIRST (critical for safety)
cat > .gitignore << 'EOF'
# CRITICAL: Exclude private android folder
backend/android/

# Node modules
node_modules/

# Environment files
.env
.env.local
.env*.local

# IDE
.idea/
.vscode/

# OS files
.DS_Store
Thumbs.db

# Build outputs
dist/
build/
.expo/
EOF

# 5. Create README
cat > README.md << 'EOF'
# ZekeAssistant

Unified monorepo combining ZEKE backend and ZEKEapp mobile companion.

## Structure
- `backend/` - ZEKE backend server and web UI (android/ excluded)
- `mobile/` - ZEKEapp mobile companion app

## Sync Commands
See SYNC_GUIDE.md for commands to sync with original repositories.

## Privacy Note
The backend/android/ folder is excluded from this public repository.
EOF

# 6. Commit the gitignore and readme FIRST
git add -A
git commit -m "Initial monorepo setup with .gitignore"

# 7. Add ZEKEapp as subtree (safe - no private content)
git subtree add --prefix=mobile https://github.com/Johnsonbros/ZEKEapp.git main --squash
git add -A
git commit -m "Add ZEKEapp as mobile subtree" --allow-empty

# 8. Clone Zeke to a TEMPORARY location
cd ~/zeke-monorepo-setup
git clone https://github.com/Johnsonbros/Zeke.git zeke-temp

# 9. Use rsync to copy to ZekeAssistant/backend EXCLUDING android/ and .git
cd ~/zeke-monorepo-setup/ZekeAssistant
mkdir -p backend
rsync -av --delete \
    --exclude='.git' \
    --exclude='android' \
    --exclude='android/' \
    ~/zeke-monorepo-setup/zeke-temp/ \
    backend/

# 10. Verify android folder is NOT present
if [ -d "backend/android" ]; then
    echo "ERROR: android folder exists! Removing..."
    rm -rf backend/android
fi

# 11. Commit the backend (without android/)
git add -A
git commit -m "Add Zeke backend (android/ excluded)"

# 12. Push to ZekeAssistant
git push origin main

# 13. Cleanup temp files
rm -rf ~/zeke-monorepo-setup/zeke-temp

echo "Setup complete! ZekeAssistant now has both repos without android/"
```

## Setting Up Sync Remotes

After initial setup, configure remotes for easier syncing:

```bash
cd ~/zeke-monorepo-setup/ZekeAssistant

# Add remotes for original repos
git remote add zeke-origin https://github.com/Johnsonbros/Zeke.git
git remote add zekeapp-origin https://github.com/Johnsonbros/ZEKEapp.git

# Verify remotes
git remote -v
```

## Daily Sync Commands

### Pull updates FROM ZEKEapp INTO ZekeAssistant (safe - uses subtree)

```bash
cd ZekeAssistant

# Pull from ZEKEapp using subtree
git subtree pull --prefix=mobile https://github.com/Johnsonbros/ZEKEapp.git main --squash

# Commit and push
git add -A
git commit -m "Sync mobile from ZEKEapp" --allow-empty
git push origin main
```

### Pull updates FROM Zeke INTO ZekeAssistant (rsync - excludes android/)

```bash
cd ~/zeke-monorepo-setup
TEMP_DIR="zeke-temp"

# Clone/update Zeke to temp location
rm -rf "$TEMP_DIR"
git clone https://github.com/Johnsonbros/Zeke.git "$TEMP_DIR"

# Rsync to backend/ excluding android/ and .git, with --delete to propagate deletions
cd ZekeAssistant
rsync -av --delete \
    --exclude='.git' \
    --exclude='android' \
    --exclude='android/' \
    ~/zeke-monorepo-setup/"$TEMP_DIR"/ \
    backend/

# Verify and commit
rm -rf backend/android  # Extra safety check
git add -A
git commit -m "Sync backend from Zeke (android/ excluded)"
git push origin main

# Cleanup
rm -rf ~/zeke-monorepo-setup/"$TEMP_DIR"
```

### Push changes FROM ZekeAssistant BACK TO ZEKEapp (safe - uses subtree)

```bash
cd ZekeAssistant
git subtree push --prefix=mobile https://github.com/Johnsonbros/ZEKEapp.git main
```

### Push changes FROM ZekeAssistant BACK TO Zeke (rsync - preserves android/)

```bash
cd ~/zeke-monorepo-setup
TEMP_DIR="zeke-push-temp"

# Clone Zeke (keeps android/ intact)
rm -rf "$TEMP_DIR"
git clone https://github.com/Johnsonbros/Zeke.git "$TEMP_DIR"

# Rsync from backend/ to Zeke clone, excluding android/ and .git
# --delete ensures files deleted in ZekeAssistant are deleted in Zeke
cd ZekeAssistant
rsync -av --delete \
    --exclude='.git' \
    --exclude='.git/' \
    --exclude='android' \
    --exclude='android/' \
    backend/ \
    ~/zeke-monorepo-setup/"$TEMP_DIR"/

# Push to Zeke
cd ~/zeke-monorepo-setup/"$TEMP_DIR"
git add -A
git commit -m "Sync from ZekeAssistant" --allow-empty
git push origin main

# Cleanup
rm -rf ~/zeke-monorepo-setup/"$TEMP_DIR"
```

## Quick Reference Scripts

Save these scripts in your ZekeAssistant directory:

### sync-pull-all.sh
```bash
#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK_DIR="$(dirname "$SCRIPT_DIR")"
TEMP_DIR="$WORK_DIR/zeke-temp"

cd "$SCRIPT_DIR"

echo "=== Syncing ZekeAssistant from original repos ==="

# Pull from ZEKEapp (subtree - safe)
echo "Pulling from ZEKEapp..."
git subtree pull --prefix=mobile https://github.com/Johnsonbros/ZEKEapp.git main --squash || true

# Pull from Zeke (rsync - excludes android/)
echo "Pulling from Zeke (excluding android/)..."
rm -rf "$TEMP_DIR"
git clone https://github.com/Johnsonbros/Zeke.git "$TEMP_DIR"

rsync -av --delete \
    --exclude='.git' \
    --exclude='android' \
    --exclude='android/' \
    "$TEMP_DIR"/ \
    backend/

rm -rf "$TEMP_DIR"
rm -rf backend/android  # Extra safety

# Commit and push
git add -A
git commit -m "Sync from Zeke and ZEKEapp" --allow-empty
git push origin main

echo "=== Sync complete! ==="
```

### sync-push-mobile.sh
```bash
#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Pushing mobile/ to ZEKEapp..."
git subtree push --prefix=mobile https://github.com/Johnsonbros/ZEKEapp.git main
echo "Done!"
```

### sync-push-backend.sh
```bash
#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK_DIR="$(dirname "$SCRIPT_DIR")"
TEMP_DIR="$WORK_DIR/zeke-push-temp"

cd "$SCRIPT_DIR"

echo "Pushing backend/ to Zeke..."
rm -rf "$TEMP_DIR"
git clone https://github.com/Johnsonbros/Zeke.git "$TEMP_DIR"

# Rsync backend/ to Zeke, preserving android/ and .git in Zeke
rsync -av --delete \
    --exclude='.git' \
    --exclude='.git/' \
    --exclude='android' \
    --exclude='android/' \
    backend/ \
    "$TEMP_DIR"/

cd "$TEMP_DIR"
git add -A
git commit -m "Sync from ZekeAssistant" --allow-empty
git push origin main

rm -rf "$TEMP_DIR"
echo "Done!"
```

## Verification Checklist

After setup, verify:

1. `backend/android/` does NOT exist in ZekeAssistant
2. `.gitignore` contains `backend/android/`
3. Hidden files (like `.env.example`) are synced correctly
4. Git history has no commits containing android/:
   ```bash
   git log --all --name-only | grep -c "android/" 
   # Should return 0
   ```

## Troubleshooting

### "Updates were rejected because the tip of your current branch is behind"
```bash
git pull --rebase origin main
git push origin main
```

### Android folder accidentally appears
```bash
rm -rf backend/android
git add -A
git commit -m "Remove accidentally added android folder"
git push origin main
```

### Need to verify android/ never in history
```bash
# Check all commits for android/ references
git log --all --full-history -- "backend/android" "**/android"
# Should return empty
```

### rsync not installed (Windows)
Use WSL (Windows Subsystem for Linux) or Git Bash with rsync installed.
