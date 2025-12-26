# ZEKEapp Android Sync

This document describes how to sync the `android/` folder from the main ZEKE repository to the separate ZEKEapp GitHub repository.

## Manual Sync (Recommended)

Run the sync script manually whenever you want to push android changes:

```bash
npx tsx scripts/zekeapp-sync.ts
```

This uses the `ZEKEAPP_GITHUB_TOKEN` secret stored in Replit to authenticate with GitHub.

## Automatic Sync (GitHub Actions - Future)

To enable automatic syncing on every push to `android/`, you'll need to create a GitHub Actions workflow. However, this requires:

1. **Token with `workflow` scope**: The GitHub token connected to Replit must have the `workflow` scope to push workflow files. Update your token at: GitHub → Settings → Developer settings → Personal access tokens

2. **Create the workflow file** directly on GitHub (not from Replit):
   - Go to your ZEKE repo on GitHub
   - Create `.github/workflows/sync-zekeapp.yml`
   - Use the workflow content below

### Workflow Content

```yaml
name: Sync Android to ZEKEapp

on:
  push:
    branches:
      - main
      - master
    paths:
      - 'android/**'
  workflow_dispatch:

jobs:
  sync-to-zekeapp:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: false

      - name: Configure Git
        run: |
          git config --global user.name "github-actions[bot]"
          git config --global user.email "github-actions[bot]@users.noreply.github.com"

      - name: Split and push android/ subtree
        env:
          GITHUB_TOKEN: ${{ secrets.ZEKEAPP_GITHUB_TOKEN }}
        run: |
          echo "Splitting android/ folder into temporary branch..."
          git subtree split --prefix=android -b companion-app-sync
          
          echo "Adding ZEKEapp remote with authentication..."
          git remote add zekeapp https://x-access-token:${GITHUB_TOKEN}@github.com/Johnsonbros/ZEKEapp.git
          
          echo "Force pushing to companion-app branch..."
          git push zekeapp companion-app-sync:companion-app --force
          
          echo "Cleaning up temporary branch..."
          git branch -D companion-app-sync
          
          echo "Sync complete!"
```

3. **Add the secret to GitHub Actions**: Go to your ZEKE repo → Settings → Secrets and variables → Actions → Add `ZEKEAPP_GITHUB_TOKEN` with a token that has `repo` scope.
