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
 */
export async function syncGitHubRepo(owner: string, repo: string, targetPath: string): Promise<{ success: boolean; message: string }> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  const fs = await import('fs');
  const path = await import('path');
  
  const fullPath = path.resolve(targetPath);
  
  try {
    // Check if directory exists and has a .git folder
    if (fs.existsSync(path.join(fullPath, '.git'))) {
      // Pull latest changes
      console.log(`[GitHub Sync] Pulling latest changes for ${owner}/${repo}...`);
      const { stdout, stderr } = await execAsync(`cd ${fullPath} && git pull origin main 2>&1 || git pull origin master 2>&1`, {
        timeout: 60000
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
        fs.rmSync(fullPath, { recursive: true, force: true });
      }
      
      const cloneUrl = `https://github.com/${owner}/${repo}.git`;
      const { stdout, stderr } = await execAsync(`git clone ${cloneUrl} ${fullPath}`, {
        timeout: 120000
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
