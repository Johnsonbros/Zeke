# ZekeAssistant Sync Guide

Quick reference for syncing between ZekeAssistant and the original repositories.

## Repository URLs

| Repo | URL | Visibility |
|------|-----|------------|
| ZekeAssistant | https://github.com/Johnsonbros/ZekeAssistant | Public |
| Zeke | https://github.com/Johnsonbros/Zeke | Private |
| ZEKEapp | https://github.com/Johnsonbros/ZEKEapp | Public |

## Directory Mapping

| ZekeAssistant Path | Original Repo | Sync Method |
|-------------------|---------------|-------------|
| `mobile/` | ZEKEapp | Git subtree (safe) |
| `backend/` | Zeke | rsync (excludes android/) |

## CRITICAL: Privacy Protection

The `backend/android/` folder must NEVER appear in ZekeAssistant.

- **ZEKEapp sync**: Uses Git subtree - safe, no private content
- **Zeke sync**: Uses rsync with exclusions - android/ is filtered before any commit

## Sync Commands

### Pull from ZEKEapp → ZekeAssistant (Subtree)

```bash
cd ZekeAssistant
git subtree pull --prefix=mobile https://github.com/Johnsonbros/ZEKEapp.git main --squash
git add -A
git commit -m "Sync mobile from ZEKEapp" --allow-empty
git push origin main
```

### Pull from Zeke → ZekeAssistant (rsync)

```bash
cd ~/zeke-monorepo-setup
TEMP_DIR="zeke-temp"

# Clone Zeke
rm -rf "$TEMP_DIR"
git clone https://github.com/Johnsonbros/Zeke.git "$TEMP_DIR"

# Rsync to backend/, excluding android/ and .git
# --delete propagates file deletions
cd ZekeAssistant
rsync -av --delete \
    --exclude='.git' \
    --exclude='android' \
    --exclude='android/' \
    ~/zeke-monorepo-setup/"$TEMP_DIR"/ \
    backend/

rm -rf ~/zeke-monorepo-setup/"$TEMP_DIR"
rm -rf backend/android  # Extra safety

git add -A
git commit -m "Sync backend from Zeke"
git push origin main
```

### Push ZekeAssistant → ZEKEapp (Subtree)

```bash
cd ZekeAssistant
git subtree push --prefix=mobile https://github.com/Johnsonbros/ZEKEapp.git main
```

### Push ZekeAssistant → Zeke (rsync)

```bash
cd ~/zeke-monorepo-setup
TEMP_DIR="zeke-push-temp"

# Clone Zeke (keeps android/)
rm -rf "$TEMP_DIR"
git clone https://github.com/Johnsonbros/Zeke.git "$TEMP_DIR"

# Rsync backend/ to Zeke, excluding android/ and .git (both stay in Zeke)
# --delete propagates file deletions
cd ZekeAssistant
rsync -av --delete \
    --exclude='.git' \
    --exclude='.git/' \
    --exclude='android' \
    --exclude='android/' \
    backend/ \
    ~/zeke-monorepo-setup/"$TEMP_DIR"/

cd ~/zeke-monorepo-setup/"$TEMP_DIR"
git add -A
git commit -m "Sync from ZekeAssistant" --allow-empty
git push origin main

rm -rf ~/zeke-monorepo-setup/"$TEMP_DIR"
```

## Workflow Examples

### AI made improvements in ZekeAssistant, push to both repos

```bash
cd ZekeAssistant
git pull origin main  # Get AI changes

# Push to ZEKEapp (subtree)
git subtree push --prefix=mobile https://github.com/Johnsonbros/ZEKEapp.git main

# Push to Zeke (use helper script)
./sync-push-backend.sh
```

### Full sync - pull updates, then push changes

```bash
cd ZekeAssistant

# Pull from both (run the sync-pull-all.sh script)
./sync-pull-all.sh

# Push to both (if you made changes)
git subtree push --prefix=mobile https://github.com/Johnsonbros/ZEKEapp.git main
./sync-push-backend.sh
```

## Quick Verification

Before pushing, always verify android/ is not present:

```bash
# Should show error (folder doesn't exist)
ls backend/android 2>/dev/null || echo "Safe: android/ not present"

# Check git status doesn't show android/
git status | grep -c android || echo "Safe: android/ not staged"
```

## Why rsync?

- `--delete` flag propagates file deletions between repos
- Copies hidden files (like `.env.example`, `.dockerignore`)
- Excludes `android/` and `.git` cleanly
- More reliable than manual `cp` commands

## Tips

1. **Always pull before push** - Keeps everything in sync
2. **Use the helper scripts** - Less chance of errors
3. **Verify before push** - Check android/ is not present
4. **rsync handles deletions** - Files removed from source are removed from destination
