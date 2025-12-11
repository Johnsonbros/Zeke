import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";

interface AgentsMdContent {
  raw: string;
  sections: Record<string, string>;
  setupCommands?: string[];
  codeStyle?: string[];
}

function parseAgentsMd(content: string): AgentsMdContent {
  const sections: Record<string, string> = {};
  const lines = content.split('\n');
  let currentSection = 'intro';
  let currentContent: string[] = [];
  
  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch) {
      if (currentContent.length > 0) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      currentSection = headerMatch[1].toLowerCase().replace(/\s+/g, '_');
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  
  if (currentContent.length > 0) {
    sections[currentSection] = currentContent.join('\n').trim();
  }
  
  const setupCommands: string[] = [];
  const setupSection = sections['setup_commands'] || sections['dev_environment'] || sections['setup'];
  if (setupSection) {
    const codeBlockMatch = setupSection.match(/```[\s\S]*?```/g);
    if (codeBlockMatch) {
      for (const block of codeBlockMatch) {
        const commands = block.replace(/```\w*\n?/g, '').trim().split('\n');
        setupCommands.push(...commands.filter(c => c.trim()));
      }
    }
    const inlineCommands = setupSection.match(/`([^`]+)`/g);
    if (inlineCommands) {
      for (const cmd of inlineCommands) {
        const command = cmd.replace(/`/g, '').trim();
        if (command.includes(' ') || command.startsWith('npm') || command.startsWith('pnpm') || command.startsWith('yarn')) {
          setupCommands.push(command);
        }
      }
    }
  }
  
  const codeStyle: string[] = [];
  const styleSection = sections['code_style'] || sections['code_conventions'] || sections['style'];
  if (styleSection) {
    const bulletPoints = styleSection.match(/^[-*]\s+(.+)$/gm);
    if (bulletPoints) {
      codeStyle.push(...bulletPoints.map(b => b.replace(/^[-*]\s+/, '').trim()));
    }
  }
  
  return {
    raw: content,
    sections,
    setupCommands: setupCommands.length > 0 ? setupCommands : undefined,
    codeStyle: codeStyle.length > 0 ? codeStyle : undefined,
  };
}

async function fetchFromGitHub(repoUrl: string): Promise<string | null> {
  let owner: string, repo: string, branch = 'main';
  
  const githubMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (githubMatch) {
    owner = githubMatch[1];
    repo = githubMatch[2].replace(/\.git$/, '').split('/')[0].split('#')[0];
    
    const branchMatch = repoUrl.match(/\/tree\/([^\/]+)/);
    if (branchMatch) {
      branch = branchMatch[1];
    }
  } else {
    return null;
  }
  
  const paths = ['AGENTS.md', 'agents.md', '.github/AGENTS.md'];
  
  for (const path of paths) {
    for (const tryBranch of [branch, 'main', 'master']) {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${tryBranch}/${path}`;
      
      try {
        const response = await fetch(rawUrl, {
          headers: {
            'User-Agent': 'ZEKE-AI-Assistant',
            'Accept': 'text/plain',
          },
        });
        
        if (response.ok) {
          return await response.text();
        }
      } catch (e) {
        continue;
      }
    }
  }
  
  return null;
}

async function fetchFromUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ZEKE-AI-Assistant',
        'Accept': 'text/plain, text/markdown',
      },
    });
    
    if (response.ok) {
      return await response.text();
    }
  } catch (e) {
    console.error('Failed to fetch AGENTS.md from URL:', e);
  }
  
  return null;
}

export const codebaseToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_agents_md",
      description: "Fetch and parse an AGENTS.md file from a GitHub repository or direct URL. AGENTS.md is a standardized format for providing coding agent instructions, containing setup commands, code style guidelines, architecture notes, and project conventions. Use this when helping with external codebases or understanding project requirements.",
      parameters: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "GitHub repository URL (e.g., 'https://github.com/owner/repo') or direct URL to an AGENTS.md file. For GitHub repos, the tool will automatically search for AGENTS.md in common locations (root, .github/).",
          },
          section: {
            type: "string",
            description: "Optional: Specific section to extract (e.g., 'setup_commands', 'code_style', 'architecture'). If not provided, returns the full parsed content.",
          },
        },
        required: ["source"],
      },
    },
  },
];

export const codebaseToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  read_agents_md: () => true,
};

export async function executeCodebaseTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  switch (toolName) {
    case "read_agents_md": {
      const { source, section } = args as { source: string; section?: string };
      
      let content: string | null = null;
      
      if (source.includes('github.com')) {
        content = await fetchFromGitHub(source);
      } else if (source.startsWith('http')) {
        content = await fetchFromUrl(source);
      } else {
        return JSON.stringify({
          success: false,
          error: "Invalid source. Provide a GitHub repository URL or direct URL to an AGENTS.md file.",
        });
      }
      
      if (!content) {
        return JSON.stringify({
          success: false,
          error: "Could not find AGENTS.md file at the specified location. The repository may not have an AGENTS.md file, or it might be in a non-standard location.",
          source,
        });
      }
      
      const parsed = parseAgentsMd(content);
      
      if (section) {
        const sectionKey = section.toLowerCase().replace(/\s+/g, '_');
        const sectionContent = parsed.sections[sectionKey];
        
        if (sectionContent) {
          return JSON.stringify({
            success: true,
            source,
            section: sectionKey,
            content: sectionContent,
          });
        } else {
          return JSON.stringify({
            success: false,
            error: `Section '${section}' not found. Available sections: ${Object.keys(parsed.sections).join(', ')}`,
            source,
          });
        }
      }
      
      return JSON.stringify({
        success: true,
        source,
        sections: Object.keys(parsed.sections),
        setupCommands: parsed.setupCommands,
        codeStyle: parsed.codeStyle,
        fullContent: parsed.raw,
      });
    }
    
    default:
      return null;
  }
}

export const codebaseToolNames = [
  "read_agents_md",
];
