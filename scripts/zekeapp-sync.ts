import { Octokit } from "@octokit/rest";
import * as fs from "fs";
import * as path from "path";

const GITHUB_TOKEN = process.env.ZEKEAPP_GITHUB_TOKEN;
const REPO_URL = process.env.ZEKEAPP_REPO_URL;
const SOURCE_DIR = "android";
const BRANCH_NAME = process.argv[2] || "companion-app";
const COMMIT_MESSAGE = process.argv[3] || `Sync from ZEKE android/ folder - ${new Date().toISOString()}`;

interface TreeItem {
  path: string;
  mode: "100644" | "100755" | "040000" | "160000" | "120000";
  type: "blob" | "tree" | "commit";
  sha: string;
}

async function main() {
  if (!GITHUB_TOKEN) {
    console.error("Error: ZEKEAPP_GITHUB_TOKEN not set");
    process.exit(1);
  }
  if (!REPO_URL) {
    console.error("Error: ZEKEAPP_REPO_URL not set");
    process.exit(1);
  }

  const repoMatch = REPO_URL.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
  if (!repoMatch) {
    console.error("Error: Could not parse repository owner/name from ZEKEAPP_REPO_URL");
    process.exit(1);
  }
  const [, owner, repo] = repoMatch;

  console.log("=== ZEKEapp GitHub API Sync ===");
  console.log(`Repository: ${owner}/${repo}`);
  console.log(`Branch: ${BRANCH_NAME}`);
  console.log(`Source: ${SOURCE_DIR}/`);
  console.log("");

  const octokit = new Octokit({ auth: GITHUB_TOKEN });

  const sourceDir = path.resolve(process.cwd(), SOURCE_DIR);
  if (!fs.existsSync(sourceDir)) {
    console.error(`Error: ${SOURCE_DIR} directory not found`);
    process.exit(1);
  }

  console.log("Step 1: Collecting files...");
  const files = collectFiles(sourceDir, "");
  console.log(`  Found ${files.length} files`);

  console.log("Step 2: Creating blobs...");
  const treeItems: TreeItem[] = [];
  let processed = 0;

  const batchSize = 10;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const blobPromises = batch.map(async (file) => {
      const content = fs.readFileSync(path.join(sourceDir, file.relativePath));
      const isExecutable = file.relativePath.endsWith(".sh");
      
      const { data: blob } = await octokit.git.createBlob({
        owner,
        repo,
        content: content.toString("base64"),
        encoding: "base64",
      });

      return {
        path: file.relativePath,
        mode: (isExecutable ? "100755" : "100644") as "100644" | "100755",
        type: "blob" as const,
        sha: blob.sha,
      };
    });

    const results = await Promise.all(blobPromises);
    treeItems.push(...results);
    processed += batch.length;
    process.stdout.write(`  Uploaded ${processed}/${files.length} files\r`);
  }
  console.log("");

  console.log("Step 3: Creating tree...");
  const { data: tree } = await octokit.git.createTree({
    owner,
    repo,
    tree: treeItems,
  });
  console.log(`  Tree SHA: ${tree.sha}`);

  let parentSha: string | undefined;
  try {
    const { data: ref } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${BRANCH_NAME}`,
    });
    parentSha = ref.object.sha;
    console.log(`  Found existing branch, parent: ${parentSha.substring(0, 7)}`);
  } catch {
    console.log("  Creating new branch (no parent)");
  }

  console.log("Step 4: Creating commit...");
  const { data: commit } = await octokit.git.createCommit({
    owner,
    repo,
    message: COMMIT_MESSAGE,
    tree: tree.sha,
    parents: parentSha ? [parentSha] : [],
  });
  console.log(`  Commit SHA: ${commit.sha.substring(0, 7)}`);

  console.log("Step 5: Updating branch reference...");
  try {
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${BRANCH_NAME}`,
      sha: commit.sha,
      force: true,
    });
    console.log(`  Updated existing branch: ${BRANCH_NAME}`);
  } catch {
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${BRANCH_NAME}`,
      sha: commit.sha,
    });
    console.log(`  Created new branch: ${BRANCH_NAME}`);
  }

  console.log("");
  console.log("=== Sync Complete ===");
  console.log(`Branch '${BRANCH_NAME}' now contains ${files.length} files from ${SOURCE_DIR}/`);
  console.log(`View at: https://github.com/${owner}/${repo}/tree/${BRANCH_NAME}`);
}

interface FileInfo {
  relativePath: string;
  absolutePath: string;
}

function collectFiles(baseDir: string, relativePath: string): FileInfo[] {
  const files: FileInfo[] = [];
  const currentDir = path.join(baseDir, relativePath);
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".expo") {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...collectFiles(baseDir, entryRelativePath));
    } else if (entry.isFile()) {
      files.push({
        relativePath: entryRelativePath,
        absolutePath: path.join(currentDir, entry.name),
      });
    }
  }

  return files;
}

main().catch((err) => {
  console.error("Sync failed:", err.message);
  process.exit(1);
});
