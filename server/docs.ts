/**
 * Internal documentation viewer.
 * 
 * Reads AGENTS.md and converts it to HTML with a table of contents.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { marked } from "marked";

interface TocEntry {
  level: number;
  text: string;
  id: string;
}

function generateId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function extractToc(markdown: string): TocEntry[] {
  const headerRegex = /^(#{1,6})\s+(.+)$/gm;
  const toc: TocEntry[] = [];
  let match;

  while ((match = headerRegex.exec(markdown)) !== null) {
    toc.push({
      level: match[1].length,
      text: match[2].trim(),
      id: generateId(match[2]),
    });
  }

  return toc;
}

function renderToc(toc: TocEntry[]): string {
  if (toc.length === 0) return "";

  const items = toc
    .map((entry) => {
      const indent = "  ".repeat(entry.level - 1);
      return `${indent}<li><a href="#${entry.id}">${entry.text}</a></li>`;
    })
    .join("\n");

  return `<nav class="toc"><h2>Table of Contents</h2><ul>${items}</ul></nav>`;
}

function addHeaderIds(html: string, toc: TocEntry[]): string {
  let result = html;
  
  for (const entry of toc) {
    const headerRegex = new RegExp(
      `(<h${entry.level}>)(${escapeRegex(entry.text)})(</h${entry.level}>)`,
      "i"
    );
    result = result.replace(
      headerRegex,
      `<h${entry.level} id="${entry.id}">$2</h${entry.level}>`
    );
  }

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function renderDocs(): string {
  try {
    const agentsMdPath = join(process.cwd(), "AGENTS.md");
    const markdown = readFileSync(agentsMdPath, "utf-8");
    
    const toc = extractToc(markdown);
    const tocHtml = renderToc(toc);
    
    let contentHtml = marked.parse(markdown) as string;
    contentHtml = addHeaderIds(contentHtml, toc);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZEKE Documentation</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
      color: #333;
    }
    .toc {
      background: #f5f5f5;
      padding: 1rem;
      border-radius: 4px;
      margin-bottom: 2rem;
    }
    .toc h2 {
      margin-top: 0;
      font-size: 1.1rem;
    }
    .toc ul {
      list-style: none;
      padding-left: 0;
      margin: 0;
    }
    .toc li {
      margin: 0.25rem 0;
    }
    .toc a {
      color: #0066cc;
      text-decoration: none;
    }
    .toc a:hover {
      text-decoration: underline;
    }
    h1, h2, h3, h4 {
      margin-top: 2rem;
      color: #222;
    }
    code {
      background: #f0f0f0;
      padding: 0.2rem 0.4rem;
      border-radius: 3px;
      font-size: 0.9em;
    }
    pre {
      background: #f5f5f5;
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
    }
    pre code {
      background: none;
      padding: 0;
    }
  </style>
</head>
<body>
  ${tocHtml}
  <main>${contentHtml}</main>
</body>
</html>`;
  } catch (error) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Documentation Error</title>
</head>
<body>
  <h1>Documentation Error</h1>
  <p>Could not load AGENTS.md: ${error instanceof Error ? error.message : "Unknown error"}</p>
</body>
</html>`;
  }
}
