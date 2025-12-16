import type { Express } from "express";
import { Octokit } from "@octokit/rest";
import { execFile, exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

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

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

const DEFAULT_OWNER = "Johnsonbros";
const DEFAULT_REPO = "ZEKE";
const DEFAULT_BRANCH = "main";
const SYNC_TARGET_DIR = "./zeke-sync";

const SAFE_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
const SAFE_PATH_PATTERN = /^\.?[a-zA-Z0-9._/-]+$/;

function validateGitParam(value: string, paramName: string): string {
  if (!SAFE_NAME_PATTERN.test(value)) {
    throw new Error(`Invalid ${paramName}: contains unsafe characters`);
  }
  return value;
}

function validatePath(value: string, paramName: string): string {
  if (!SAFE_PATH_PATTERN.test(value) || value.includes('..')) {
    throw new Error(`Invalid ${paramName}: contains unsafe characters or path traversal`);
  }
  return value;
}

function getRepoConfig(query: any) {
  const owner = (query.owner as string) || DEFAULT_OWNER;
  const repo = (query.repo as string) || DEFAULT_REPO;
  const branch = (query.branch as string) || DEFAULT_BRANCH;
  const targetDir = (query.targetDir as string) || SYNC_TARGET_DIR;
  
  return {
    owner: validateGitParam(owner, 'owner'),
    repo: validateGitParam(repo, 'repo'),
    branch: validateGitParam(branch, 'branch'),
    targetDir: validatePath(targetDir, 'targetDir')
  };
}

async function ensureGitConfig() {
  try {
    await execAsync('git config user.email "zeke@replit.com"');
    await execAsync('git config user.name "ZEKE Sync"');
  } catch (error) {
    console.log("[GitHub] Git config already set or not needed");
  }
}

async function pullFromGitHub(owner: string, repo: string, branch: string, targetDir: string): Promise<string> {
  const repoPath = path.resolve(targetDir);
  
  if (!fs.existsSync(repoPath)) {
    fs.mkdirSync(repoPath, { recursive: true });
  }

  const gitDir = path.join(repoPath, ".git");
  const accessToken = await getAccessToken();
  const cloneUrl = `https://x-access-token:${accessToken}@github.com/${owner}/${repo}.git`;

  try {
    if (!fs.existsSync(gitDir)) {
      console.log(`[GitHub] Cloning ${owner}/${repo} to ${repoPath}`);
      await execFileAsync('git', ['clone', '--branch', branch, cloneUrl, repoPath]);
      return `Cloned ${owner}/${repo} (${branch}) to ${targetDir}`;
    } else {
      console.log(`[GitHub] Pulling latest changes for ${owner}/${repo}`);
      await execFileAsync('git', ['-C', repoPath, 'remote', 'set-url', 'origin', cloneUrl]);
      await execFileAsync('git', ['-C', repoPath, 'fetch', 'origin']);
      await execFileAsync('git', ['-C', repoPath, 'reset', '--hard', `origin/${branch}`]);
      return `Pulled latest from ${owner}/${repo} (${branch})`;
    }
  } catch (error: any) {
    throw new Error(`Failed to sync from GitHub: ${error.message}`);
  }
}

function sanitizeCommitMessage(message: string): string {
  return message
    .replace(/[`$\\]/g, '')
    .replace(/\n/g, ' ')
    .substring(0, 500);
}

async function pushToGitHub(owner: string, repo: string, branch: string, targetDir: string, message: string): Promise<string> {
  const repoPath = path.resolve(targetDir);
  const gitDir = path.join(repoPath, ".git");

  if (!fs.existsSync(gitDir)) {
    throw new Error(`No git repository found at ${targetDir}. Run sync first.`);
  }

  await ensureGitConfig();

  const accessToken = await getAccessToken();
  const pushUrl = `https://x-access-token:${accessToken}@github.com/${owner}/${repo}.git`;

  try {
    await execFileAsync('git', ['-C', repoPath, 'remote', 'set-url', 'origin', pushUrl]);
    
    const { stdout: statusOutput } = await execFileAsync('git', ['-C', repoPath, 'status', '--porcelain']);
    
    if (!statusOutput.trim()) {
      return "No changes to commit";
    }

    const sanitizedMessage = sanitizeCommitMessage(message);
    
    await execFileAsync('git', ['-C', repoPath, 'add', '-A']);
    await execFileAsync('git', ['-C', repoPath, 'commit', '-m', sanitizedMessage]);
    await execFileAsync('git', ['-C', repoPath, 'push', 'origin', branch]);

    return `Pushed changes to ${owner}/${repo} (${branch}): ${sanitizedMessage}`;
  } catch (error: any) {
    throw new Error(`Failed to push to GitHub: ${error.message}`);
  }
}

export function registerGitHubRoutes(app: Express): void {
  app.post("/api/github/webhook", async (req, res) => {
    try {
      const event = req.headers["x-github-event"];
      const payload = req.body;

      console.log(`[GitHub Webhook] Received event: ${event}`);

      if (event === "push") {
        const { owner, repo, branch, targetDir } = getRepoConfig(req.query);
        
        const pushBranch = payload.ref?.replace("refs/heads/", "");
        if (pushBranch !== branch) {
          console.log(`[GitHub Webhook] Ignoring push to ${pushBranch}, watching ${branch}`);
          return res.json({ status: "ignored", reason: `Push to ${pushBranch}, not ${branch}` });
        }

        const result = await pullFromGitHub(owner, repo, branch, targetDir);
        console.log(`[GitHub Webhook] ${result}`);
        
        res.json({ 
          status: "synced", 
          message: result,
          commits: payload.commits?.length || 0,
          pusher: payload.pusher?.name
        });
      } else {
        res.json({ status: "acknowledged", event });
      }
    } catch (error: any) {
      console.error("[GitHub Webhook] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/github/sync", async (req, res) => {
    try {
      const { owner, repo, branch, targetDir } = getRepoConfig(req.query);
      
      console.log(`[GitHub Sync] Manual sync requested for ${owner}/${repo}`);
      const result = await pullFromGitHub(owner, repo, branch, targetDir);
      
      res.json({ 
        status: "success", 
        message: result,
        config: { owner, repo, branch, targetDir }
      });
    } catch (error: any) {
      console.error("[GitHub Sync] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/github/push", async (req, res) => {
    try {
      const { owner, repo, branch, targetDir } = getRepoConfig(req.query);
      const message = req.body?.message || `ZEKE sync: ${new Date().toISOString()}`;
      
      console.log(`[GitHub Push] Pushing changes to ${owner}/${repo}`);
      const result = await pushToGitHub(owner, repo, branch, targetDir, message);
      
      res.json({ 
        status: "success", 
        message: result,
        config: { owner, repo, branch, targetDir }
      });
    } catch (error: any) {
      console.error("[GitHub Push] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/github/create-webhook", async (req, res) => {
    try {
      const { owner, repo } = getRepoConfig(req.query);
      const octokit = await getUncachableGitHubClient();
      
      const webhookUrl = req.body?.webhookUrl || 
        `https://${process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(",")[0]}/api/github/webhook`;

      console.log(`[GitHub] Creating webhook for ${owner}/${repo} -> ${webhookUrl}`);

      const { data: existingHooks } = await octokit.repos.listWebhooks({
        owner,
        repo
      });

      const existingHook = existingHooks.find(
        (hook: any) => hook.config?.url === webhookUrl
      );

      if (existingHook) {
        console.log(`[GitHub] Webhook already exists: ${existingHook.id}`);
        return res.json({
          status: "exists",
          message: "Webhook already configured",
          webhook: {
            id: existingHook.id,
            url: webhookUrl,
            events: existingHook.events
          }
        });
      }

      const { data: webhook } = await octokit.repos.createWebhook({
        owner,
        repo,
        config: {
          url: webhookUrl,
          content_type: "json",
          insecure_ssl: "0"
        },
        events: ["push"],
        active: true
      });

      console.log(`[GitHub] Created webhook: ${webhook.id}`);

      res.json({
        status: "created",
        message: "Webhook created successfully",
        webhook: {
          id: webhook.id,
          url: webhookUrl,
          events: webhook.events
        }
      });
    } catch (error: any) {
      console.error("[GitHub] Error creating webhook:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/github/status", async (_req, res) => {
    try {
      const octokit = await getUncachableGitHubClient();
      const { data: user } = await octokit.users.getAuthenticated();
      
      res.json({
        connected: true,
        user: user.login,
        defaultRepo: `${DEFAULT_OWNER}/${DEFAULT_REPO}`,
        syncDir: SYNC_TARGET_DIR
      });
    } catch (error: any) {
      res.json({
        connected: false,
        error: error.message
      });
    }
  });
}
