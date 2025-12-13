import fs from "fs";
import path from "path";
import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import { getUploadedFile, getAllUploadedFiles } from "../db";
import { analyzeImage, extractPdfText, getFileAnalysis } from "../services/fileProcessor";

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
  {
    type: "function",
    function: {
      name: "analyze_uploaded_image",
      description: "Analyze an uploaded image using AI vision. Extracts text, identifies objects, and provides a detailed description. Use when the user shares an image and wants you to describe or analyze it.",
      parameters: {
        type: "object",
        properties: {
          file_id: {
            type: "string",
            description: "The ID of the uploaded image file to analyze",
          },
        },
        required: ["file_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "extract_pdf_content",
      description: "Extract text content from an uploaded PDF file. Use when the user shares a PDF and wants you to read or summarize its contents.",
      parameters: {
        type: "object",
        properties: {
          file_id: {
            type: "string",
            description: "The ID of the uploaded PDF file to extract text from",
          },
        },
        required: ["file_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_uploaded_file_info",
      description: "Get metadata about an uploaded file including its name, type, size, and processing status.",
      parameters: {
        type: "object",
        properties: {
          file_id: {
            type: "string",
            description: "The ID of the uploaded file to get info about",
          },
        },
        required: ["file_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_uploaded_files",
      description: "List all uploaded files, optionally filtered by conversation. Use to see what files have been shared.",
      parameters: {
        type: "object",
        properties: {
          conversation_id: {
            type: "string",
            description: "Optional: filter files by conversation ID",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_file_analysis_to_memory",
      description: "Save the analysis or extracted content from an uploaded file to memory notes for future reference.",
      parameters: {
        type: "object",
        properties: {
          file_id: {
            type: "string",
            description: "The ID of the uploaded file whose analysis to save",
          },
          note_title: {
            type: "string",
            description: "Title for the memory note",
          },
          additional_context: {
            type: "string",
            description: "Optional additional context or notes to include",
          },
        },
        required: ["file_id", "note_title"],
      },
    },
  },
];

export const fileToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  read_file: (p) => p.canAccessPersonalInfo,
  write_file: (p) => p.canAccessPersonalInfo,
  list_files: (p) => p.canAccessPersonalInfo,
  analyze_uploaded_image: (p) => p.canAccessPersonalInfo,
  extract_pdf_content: (p) => p.canAccessPersonalInfo,
  get_uploaded_file_info: (p) => p.canAccessPersonalInfo,
  list_uploaded_files: (p) => p.canAccessPersonalInfo,
  save_file_analysis_to_memory: (p) => p.canAccessPersonalInfo,
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

interface AnalyzeImageArgs {
  file_id: string;
}

interface ExtractPdfArgs {
  file_id: string;
}

interface GetFileInfoArgs {
  file_id: string;
}

interface ListUploadedFilesArgs {
  conversation_id?: string;
}

interface SaveFileAnalysisArgs {
  file_id: string;
  note_title: string;
  additional_context?: string;
}

export async function executeFileTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  switch (toolName) {
    case "read_file": {
      const { file_path } = args as unknown as ReadFileArgs;
      
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
      const { file_path, content, append } = args as unknown as WriteFileArgs;
      
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
      const { directory } = args as unknown as ListFilesArgs;
      
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

    case "analyze_uploaded_image": {
      const { file_id } = args as unknown as AnalyzeImageArgs;
      try {
        const file = getUploadedFile(file_id);
        if (!file) {
          return JSON.stringify({ error: `File not found: ${file_id}` });
        }
        if (file.fileType !== "image") {
          return JSON.stringify({ error: `File is not an image: ${file.fileType}` });
        }
        const result = await analyzeImage(file_id);
        return JSON.stringify({
          success: true,
          file_id,
          filename: file.originalName,
          analysis: result,
        });
      } catch (error: any) {
        return JSON.stringify({ error: error.message || "Failed to analyze image" });
      }
    }

    case "extract_pdf_content": {
      const { file_id } = args as unknown as ExtractPdfArgs;
      try {
        const file = getUploadedFile(file_id);
        if (!file) {
          return JSON.stringify({ error: `File not found: ${file_id}` });
        }
        if (file.fileType !== "pdf") {
          return JSON.stringify({ error: `File is not a PDF: ${file.fileType}` });
        }
        const result = await extractPdfText(file_id);
        return JSON.stringify({
          success: true,
          file_id,
          filename: file.originalName,
          pageCount: result.pageCount,
          text: result.text.substring(0, 5000),
          fullTextLength: result.text.length,
          info: result.info,
        });
      } catch (error: any) {
        return JSON.stringify({ error: error.message || "Failed to extract PDF content" });
      }
    }

    case "get_uploaded_file_info": {
      const { file_id } = args as unknown as GetFileInfoArgs;
      const file = getUploadedFile(file_id);
      if (!file) {
        return JSON.stringify({ error: `File not found: ${file_id}` });
      }
      return JSON.stringify({
        id: file.id,
        filename: file.originalName,
        fileType: file.fileType,
        mimeType: file.mimeType,
        size: file.size,
        processingStatus: file.processingStatus,
        hasExtractedText: !!file.extractedText,
        hasAnalysis: !!file.analysisResult,
        createdAt: file.createdAt,
      });
    }

    case "list_uploaded_files": {
      const { conversation_id } = args as unknown as ListUploadedFilesArgs;
      const files = getAllUploadedFiles();
      const filtered = conversation_id
        ? files.filter(f => f.conversationId === conversation_id)
        : files;
      return JSON.stringify({
        count: filtered.length,
        files: filtered.map(f => ({
          id: f.id,
          filename: f.originalName,
          fileType: f.fileType,
          size: f.size,
          processingStatus: f.processingStatus,
          createdAt: f.createdAt,
        })),
      });
    }

    case "save_file_analysis_to_memory": {
      const { file_id, note_title, additional_context } = args as unknown as SaveFileAnalysisArgs;
      const file = getUploadedFile(file_id);
      if (!file) {
        return JSON.stringify({ error: `File not found: ${file_id}` });
      }
      const analysis = getFileAnalysis(file_id);
      if (!analysis && !file.extractedText) {
        return JSON.stringify({ error: "File has not been processed yet. Run analysis first." });
      }
      
      let noteContent = `# ${note_title}\n\n`;
      noteContent += `**Source File:** ${file.originalName}\n`;
      noteContent += `**File Type:** ${file.fileType}\n`;
      noteContent += `**Processed:** ${file.createdAt}\n\n`;
      
      if (file.extractedText) {
        noteContent += `## Extracted Text\n\n${file.extractedText}\n\n`;
      }
      if (analysis) {
        noteContent += `## Analysis\n\n\`\`\`json\n${JSON.stringify(analysis, null, 2)}\n\`\`\`\n\n`;
      }
      if (additional_context) {
        noteContent += `## Notes\n\n${additional_context}\n`;
      }
      
      const notesDir = path.join(process.cwd(), "notes");
      if (!fs.existsSync(notesDir)) {
        fs.mkdirSync(notesDir, { recursive: true });
      }
      const sanitizedTitle = note_title.replace(/[^a-zA-Z0-9-_]/g, "_").toLowerCase();
      const noteFilename = `${sanitizedTitle}_${Date.now()}.md`;
      const notePath = path.join(notesDir, noteFilename);
      fs.writeFileSync(notePath, noteContent);
      
      return JSON.stringify({
        success: true,
        message: "File analysis saved to memory",
        notePath: `notes/${noteFilename}`,
      });
    }
    
    default:
      return null;
  }
}

export const fileToolNames = [
  "read_file",
  "write_file",
  "list_files",
  "analyze_uploaded_image",
  "extract_pdf_content",
  "get_uploaded_file_info",
  "list_uploaded_files",
  "save_file_analysis_to_memory",
];
