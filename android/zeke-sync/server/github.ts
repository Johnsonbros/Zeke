/**
 * GitHub Integration for ZEKE
 * Uses Replit's GitHub connection for authentication
 */

import { Octokit } from '@octokit/rest';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
export async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

/**
 * Sync a GitHub repository to a local folder
 * Uses the Replit GitHub connector for authentication
 */
export async function syncGitHubRepo(owner: string, repo: string, targetPath: string): Promise<{ success: boolean; message: string }> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  const fs = await import('fs');
  const path = await import('path');
  
  const fullPath = path.resolve(targetPath);
  
  try {
    // Get access token from GitHub connector
    let accessToken: string | null = null;
    try {
      accessToken = await getAccessToken();
    } catch (e) {
      console.log(`[GitHub Sync] No GitHub token available, using public access`);
    }
    
    // Environment to prevent git from prompting for credentials
    const gitEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: 'echo',
    };
    
    // Build the clone URL with token if available
    const cloneUrl = accessToken 
      ? `https://x-access-token:${accessToken}@github.com/${owner}/${repo}.git`
      : `https://github.com/${owner}/${repo}.git`;
    
    // Check if directory exists and has a .git folder
    if (fs.existsSync(path.join(fullPath, '.git'))) {
      // Pull latest changes - update remote URL with token
      console.log(`[GitHub Sync] Pulling latest changes for ${owner}/${repo}...`);
      
      // Update remote URL with fresh token
      await execAsync(`cd ${fullPath} && git remote set-url origin "${cloneUrl}"`, {
        timeout: 10000,
        env: gitEnv
      });
      
      const { stdout, stderr } = await execAsync(`cd ${fullPath} && git fetch origin && git reset --hard origin/main 2>&1 || git reset --hard origin/master 2>&1`, {
        timeout: 60000,
        env: gitEnv
      });
      console.log(`[GitHub Sync] Pull output: ${stdout}`);
      if (stderr) console.log(`[GitHub Sync] Pull stderr: ${stderr}`);
      return { success: true, message: `Pulled latest changes: ${stdout.trim()}` };
    } else {
      // Clone the repository
      console.log(`[GitHub Sync] Cloning ${owner}/${repo} to ${fullPath}...`);
      
      // Ensure parent directory exists
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      
      // Remove existing directory if it exists but isn't a git repo
      if (fs.existsSync(fullPath)) {
        console.log(`[GitHub Sync] Removing existing non-git directory at ${fullPath}...`);
        fs.rmSync(fullPath, { recursive: true, force: true });
      }
      
      const { stdout, stderr } = await execAsync(`git clone --depth 1 "${cloneUrl}" ${fullPath}`, {
        timeout: 120000,
        env: gitEnv
      });
      console.log(`[GitHub Sync] Clone output: ${stdout}`);
      if (stderr) console.log(`[GitHub Sync] Clone stderr: ${stderr}`);
      return { success: true, message: `Cloned repository successfully` };
    }
  } catch (error: any) {
    console.error(`[GitHub Sync] Error:`, error);
    return { success: false, message: error.message || 'Unknown error' };
  }
}

/**
 * Push local changes to a GitHub repository
 */
/**
 * Create a webhook on a GitHub repository
 */
export async function createGitHubWebhook(owner: string, repo: string, webhookUrl: string): Promise<{ success: boolean; message: string; webhookId?: number }> {
  try {
    const octokit = await getUncachableGitHubClient();
    
    // Check if webhook already exists
    const { data: existingHooks } = await octokit.repos.listWebhooks({ owner, repo });
    const existing = existingHooks.find(h => h.config?.url === webhookUrl);
    
    if (existing) {
      return { success: true, message: 'Webhook already exists', webhookId: existing.id };
    }
    
    // Create the webhook
    const { data: webhook } = await octokit.repos.createWebhook({
      owner,
      repo,
      config: {
        url: webhookUrl,
        content_type: 'json',
        insecure_ssl: '0',
      },
      events: ['push'],
      active: true,
    });
    
    console.log(`[GitHub] Created webhook ${webhook.id} for ${owner}/${repo}`);
    return { success: true, message: `Webhook created successfully`, webhookId: webhook.id };
  } catch (error: any) {
    console.error(`[GitHub] Error creating webhook:`, error);
    return { success: false, message: error.message || 'Failed to create webhook' };
  }
}

export async function pushToGitHub(owner: string, repo: string, targetPath: string, commitMessage: string): Promise<{ success: boolean; message: string }> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  const fs = await import('fs');
  const path = await import('path');
  
  const fullPath = path.resolve(targetPath);
  
  try {
    // Check if it's a git repo
    if (!fs.existsSync(path.join(fullPath, '.git'))) {
      return { success: false, message: 'Not a git repository' };
    }
    
    // Get access token
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { success: false, message: 'GitHub not connected' };
    }
    
    const gitEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
    };
    
    // Update remote URL with token
    const remoteUrl = `https://x-access-token:${accessToken}@github.com/${owner}/${repo}.git`;
    await execAsync(`cd ${fullPath} && git remote set-url origin "${remoteUrl}"`, {
      timeout: 10000,
      env: gitEnv
    });
    
    // Configure git user for commits
    await execAsync(`cd ${fullPath} && git config user.email "zeke@replit.app" && git config user.name "ZEKE"`, {
      timeout: 10000,
      env: gitEnv
    });
    
    // Stage all changes
    await execAsync(`cd ${fullPath} && git add -A`, {
      timeout: 30000,
      env: gitEnv
    });
    
    // Check if there are changes to commit
    const { stdout: statusOutput } = await execAsync(`cd ${fullPath} && git status --porcelain`, {
      timeout: 10000,
      env: gitEnv
    });
    
    if (!statusOutput.trim()) {
      return { success: true, message: 'No changes to push' };
    }
    
    // Commit changes
    await execAsync(`cd ${fullPath} && git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
      timeout: 30000,
      env: gitEnv
    });
    
    // Push to GitHub
    const { stdout, stderr } = await execAsync(`cd ${fullPath} && git push origin main 2>&1 || git push origin master 2>&1`, {
      timeout: 60000,
      env: gitEnv
    });
    
    console.log(`[GitHub Push] Output: ${stdout}`);
    if (stderr) console.log(`[GitHub Push] Stderr: ${stderr}`);
    
    return { success: true, message: `Pushed changes: ${commitMessage}` };
  } catch (error: any) {
    console.error(`[GitHub Push] Error:`, error);
    return { success: false, message: error.message || 'Unknown error' };
  }
}
