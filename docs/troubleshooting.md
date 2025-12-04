# Troubleshooting

This document covers common issues and their solutions.

## Git Rebase State Issues

### Error: "Unsupported state: you are in the middle of a rebase"

This error occurs when Git detects an incomplete rebase operation. To resolve this:

1. **Abort the rebase** (recommended if you want to start over):
   ```bash
   git rebase --abort
   ```

2. **Continue the rebase** (if you've resolved conflicts):
   ```bash
   git rebase --continue
   ```

3. **Skip the current commit** (if the current commit is problematic):
   ```bash
   git rebase --skip
   ```

### Checking rebase status

To check if a rebase is in progress, run:
```bash
git status
```

Git will show a message like "rebase in progress" if a rebase is ongoing, along with guidance on how to proceed.

### After aborting a rebase

After aborting a rebase, your branch will return to its state before the rebase started. You can then:
- Pull latest changes: `git pull origin main`
- Create a new branch: `git checkout -b new-feature`
- Retry the rebase: `git rebase main`

## Other Common Issues

### Database initialization fails

If `npm run db:init` fails, ensure:
1. No other process is using `zeke.db`
2. You have write permissions in the project directory
3. Run `rm zeke.db` and try again

### Bootstrap script fails

If `script/bootstrap` fails:
1. Ensure Python and Node.js are installed
2. Run `npm ci` manually to see detailed errors. Look for:
   - `ENOENT` errors indicating missing files or directories
   - `EPERM` errors indicating permission issues
   - Network-related errors if packages cannot be downloaded
3. Run `pip install uv` if you see "uv: command not found"
