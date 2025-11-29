import fs from "fs";
import path from "path";
import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";

export const fileToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file. Use for accessing notes, documents, or data files.",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Path to the file to read (relative to the project root)",
          },
        },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file. Use for saving notes, creating documents, or storing data.",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Path to the file to write (relative to the project root)",
          },
          content: {
            type: "string",
            description: "The content to write to the file",
          },
          append: {
            type: "boolean",
            description: "If true, append to the file instead of overwriting. Default is false.",
          },
        },
        required: ["file_path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files in a directory",
      parameters: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Path to the directory to list (relative to project root). Use '.' for root.",
          },
        },
        required: ["directory"],
      },
    },
  },
];

export const fileToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  read_file: (p) => p.canAccessPersonalInfo,
  write_file: (p) => p.canAccessPersonalInfo,
  list_files: (p) => p.canAccessPersonalInfo,
};

interface ReadFileArgs {
  file_path: string;
}

interface WriteFileArgs {
  file_path: string;
  content: string;
  append?: boolean;
}

interface ListFilesArgs {
  directory: string;
}

export async function executeFileTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  switch (toolName) {
    case "read_file": {
      const { file_path } = args as ReadFileArgs;
      
      const normalizedPath = path.normalize(file_path).replace(/^(\.\.(\/|\\|$))+/, '');
      const projectRoot = process.cwd();
      const fullPath = path.resolve(projectRoot, normalizedPath);
      
      if (!fullPath.startsWith(projectRoot)) {
        return JSON.stringify({ 
          error: "Access denied. Path traversal not allowed." 
        });
      }
      
      const relativePath = path.relative(projectRoot, fullPath);
      const allowedPrefixes = ["notes/", "notes\\", "data/", "data\\"];
      const allowedFiles = ["zeke_profile.md", "zeke_knowledge.md"];
      const isAllowed = allowedPrefixes.some(p => relativePath.startsWith(p)) || 
                        allowedFiles.includes(relativePath);
      
      if (!isAllowed) {
        return JSON.stringify({ 
          error: "Access denied. Can only read files in notes/, data/, or zeke config files." 
        });
      }
      
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        return JSON.stringify({ file_path: relativePath, content, size: content.length });
      } catch (error: any) {
        return JSON.stringify({ 
          error: error.code === "ENOENT" ? "File not found" : "Failed to read file" 
        });
      }
    }
    
    case "write_file": {
      const { file_path, content, append } = args as WriteFileArgs;
      
      const normalizedPath = path.normalize(file_path).replace(/^(\.\.(\/|\\|$))+/, '');
      const projectRoot = process.cwd();
      const fullPath = path.resolve(projectRoot, normalizedPath);
      
      if (!fullPath.startsWith(projectRoot)) {
        return JSON.stringify({ 
          error: "Access denied. Path traversal not allowed." 
        });
      }
      
      const relativePath = path.relative(projectRoot, fullPath);
      const allowedPrefixes = ["notes/", "notes\\", "data/", "data\\"];
      const isAllowed = allowedPrefixes.some(p => relativePath.startsWith(p));
      
      if (!isAllowed) {
        return JSON.stringify({ 
          error: "Access denied. Can only write files in notes/ or data/ directories." 
        });
      }
      
      try {
        const dir = path.dirname(fullPath);
        
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        if (append) {
          fs.appendFileSync(fullPath, content);
        } else {
          fs.writeFileSync(fullPath, content);
        }
        
        return JSON.stringify({ 
          success: true, 
          file_path: relativePath, 
          message: append ? "Content appended to file" : "File written successfully" 
        });
      } catch (error) {
        return JSON.stringify({ error: "Failed to write file" });
      }
    }
    
    case "list_files": {
      const { directory } = args as ListFilesArgs;
      
      const normalizedPath = path.normalize(directory).replace(/^(\.\.(\/|\\|$))+/, '');
      const projectRoot = process.cwd();
      const fullPath = path.resolve(projectRoot, normalizedPath);
      
      if (!fullPath.startsWith(projectRoot)) {
        return JSON.stringify({ 
          error: "Access denied. Path traversal not allowed." 
        });
      }
      
      const relativePath = path.relative(projectRoot, fullPath);
      const allowedDirs = ["notes", "data", ""];
      const allowedPrefixes = ["notes/", "notes\\", "data/", "data\\"];
      const isAllowed = allowedDirs.includes(relativePath) || 
                        allowedPrefixes.some(p => relativePath.startsWith(p));
      
      if (!isAllowed) {
        return JSON.stringify({ 
          error: "Access denied. Can only list files in notes/, data/, or root directory." 
        });
      }
      
      try {
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        
        const allowedRootEntries = ["notes", "data", "zeke_profile.md", "zeke_knowledge.md"];
        
        const files = entries
          .filter(e => {
            if (e.name.startsWith(".") || e.name === "node_modules") return false;
            if (relativePath === "") {
              return allowedRootEntries.includes(e.name);
            }
            return true;
          })
          .map(e => ({
            name: e.name,
            type: e.isDirectory() ? "directory" : "file",
          }));
        
        return JSON.stringify({ directory: relativePath || ".", files });
      } catch (error) {
        return JSON.stringify({ error: "Directory not found or cannot be read" });
      }
    }
    
    default:
      return null;
  }
}

export const fileToolNames = [
  "read_file",
  "write_file",
  "list_files",
];
