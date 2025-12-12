import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import {
  createFolder,
  getFolder,
  getAllFolders,
  getFolderTree,
  updateFolder,
  deleteFolder as dbDeleteFolder,
  createDocument,
  getDocument,
  getAllDocuments,
  getDocumentsByFolder,
  updateDocument,
  deleteDocument as dbDeleteDocument,
  getDocumentWithFolder,
  searchDocuments as dbSearchDocuments,
} from "../db";
import type { InsertFolder, InsertDocument, DocumentType } from "@shared/schema";

export const documentToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_all_folders",
      description: "Get the complete folder tree structure including all folders and their hierarchy. Use this to understand how files are organized.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_documents",
      description: "List documents, optionally filtered by folder or search query. Use this to see what documents exist.",
      parameters: {
        type: "object",
        properties: {
          folder_id: {
            type: "string",
            description: "Optional folder ID to filter documents. Use 'root' or null for root-level documents.",
          },
          search_query: {
            type: "string",
            description: "Optional search query to filter documents by title or content.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_document",
      description: "Read the full content of a specific document. Use this when you need to access or reference a document's contents.",
      parameters: {
        type: "object",
        properties: {
          document_id: {
            type: "string",
            description: "The ID of the document to read.",
          },
        },
        required: ["document_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_document",
      description: "Create a new document. Use this proactively when the user shares ideas, plans, lists, or information worth saving. Be proactive about saving valuable information without always asking first.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The title of the document.",
          },
          content: {
            type: "string",
            description: "The content/body of the document.",
          },
          type: {
            type: "string",
            enum: ["note", "document", "template", "reference"],
            description: "The type of document. 'note' for quick notes and ideas, 'document' for longer content, 'template' for reusable templates, 'reference' for reference material.",
          },
          folder_id: {
            type: "string",
            description: "Optional folder ID to place the document in. Leave empty for root level.",
          },
        },
        required: ["title", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_document",
      description: "Update an existing document's title or content. Use this to edit, add to, or modify existing documents.",
      parameters: {
        type: "object",
        properties: {
          document_id: {
            type: "string",
            description: "The ID of the document to update.",
          },
          title: {
            type: "string",
            description: "New title for the document (optional).",
          },
          content: {
            type: "string",
            description: "New content for the document (optional).",
          },
          append_content: {
            type: "string",
            description: "Content to append to the existing document content (alternative to replacing content).",
          },
        },
        required: ["document_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_document",
      description: "Delete a document. For single documents, proceed without confirmation. The user can always undo if needed.",
      parameters: {
        type: "object",
        properties: {
          document_id: {
            type: "string",
            description: "The ID of the document to delete.",
          },
        },
        required: ["document_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_folder",
      description: "Create a new folder to organize documents. Use this when the user wants to organize content or when you recognize a new category of information.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name of the folder.",
          },
          parent_folder_id: {
            type: "string",
            description: "Optional parent folder ID for nested folders.",
          },
          color: {
            type: "string",
            description: "Optional color for the folder (hex code like #3b82f6).",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_folder",
      description: "Delete a folder. IMPORTANT: If the folder contains documents, ask the user for confirmation first and explain what will happen to the documents (they'll be moved to root). Only delete empty folders without asking.",
      parameters: {
        type: "object",
        properties: {
          folder_id: {
            type: "string",
            description: "The ID of the folder to delete.",
          },
          confirmed: {
            type: "boolean",
            description: "Set to true only after user has confirmed deletion of a non-empty folder.",
          },
        },
        required: ["folder_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_document",
      description: "Move a document to a different folder. Use this to help organize documents.",
      parameters: {
        type: "object",
        properties: {
          document_id: {
            type: "string",
            description: "The ID of the document to move.",
          },
          target_folder_id: {
            type: "string",
            description: "The ID of the destination folder. Use null or 'root' for root level.",
          },
        },
        required: ["document_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_documents",
      description: "Search across all documents by title and content. Use this to find relevant documents based on keywords or topics.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to find in document titles and content.",
          },
        },
        required: ["query"],
      },
    },
  },
];

export const documentToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  list_all_folders: (p) => p.canAccessPersonalInfo,
  list_documents: (p) => p.canAccessPersonalInfo,
  read_document: (p) => p.canAccessPersonalInfo,
  create_document: (p) => p.canAccessPersonalInfo,
  update_document: (p) => p.canAccessPersonalInfo,
  delete_document: (p) => p.canAccessPersonalInfo,
  create_folder: (p) => p.canAccessPersonalInfo,
  delete_folder: (p) => p.canAccessPersonalInfo,
  move_document: (p) => p.canAccessPersonalInfo,
  search_documents: (p) => p.canAccessPersonalInfo,
};

interface ListDocumentsArgs {
  folder_id?: string;
  search_query?: string;
}

interface ReadDocumentArgs {
  document_id: string;
}

interface CreateDocumentArgs {
  title: string;
  content: string;
  type?: DocumentType;
  folder_id?: string;
}

interface UpdateDocumentArgs {
  document_id: string;
  title?: string;
  content?: string;
  append_content?: string;
}

interface DeleteDocumentArgs {
  document_id: string;
}

interface CreateFolderArgs {
  name: string;
  parent_folder_id?: string;
  color?: string;
}

interface DeleteFolderArgs {
  folder_id: string;
  confirmed?: boolean;
}

interface MoveDocumentArgs {
  document_id: string;
  target_folder_id?: string;
}

interface SearchDocumentsArgs {
  query: string;
}

export async function executeDocumentTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  try {
    switch (toolName) {
      case "list_all_folders": {
        const folderTree = getFolderTree();
        const simplifiedTree = folderTree.map(f => ({
          id: f.id,
          name: f.name,
          color: f.color,
          documentCount: f.documents?.length || 0,
          children: f.children.map(c => ({
            id: c.id,
            name: c.name,
            color: c.color,
            documentCount: c.documents?.length || 0,
          })),
        }));
        return JSON.stringify({
          success: true,
          folders: simplifiedTree,
          totalFolders: getAllFolders().length,
        });
      }

      case "list_documents": {
        const { folder_id, search_query } = args as ListDocumentsArgs;
        
        let documents;
        if (search_query) {
          documents = dbSearchDocuments(search_query);
        } else if (folder_id && folder_id !== "root") {
          documents = getDocumentsByFolder(folder_id);
        } else if (folder_id === "root" || folder_id === null) {
          documents = getDocumentsByFolder(null);
        } else {
          documents = getAllDocuments();
        }

        const simplifiedDocs = documents.map(d => ({
          id: d.id,
          title: d.title,
          type: d.type,
          wordCount: d.wordCount,
          folderId: d.folderId,
          isPinned: d.isPinned,
          updatedAt: d.updatedAt,
        }));

        return JSON.stringify({
          success: true,
          documents: simplifiedDocs,
          count: simplifiedDocs.length,
        });
      }

      case "read_document": {
        const { document_id } = args as unknown as ReadDocumentArgs;
        const doc = getDocumentWithFolder(document_id);
        
        if (!doc) {
          return JSON.stringify({ success: false, error: "Document not found" });
        }

        return JSON.stringify({
          success: true,
          document: {
            id: doc.id,
            title: doc.title,
            content: doc.content,
            type: doc.type,
            wordCount: doc.wordCount,
            folder: doc.folder ? { id: doc.folder.id, name: doc.folder.name } : null,
            isPinned: doc.isPinned,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          },
        });
      }

      case "create_document": {
        const { title, content, type, folder_id } = args as unknown as CreateDocumentArgs;
        
        const insertData: InsertDocument = {
          title,
          content,
          type: type || "note",
          folderId: folder_id || null,
        };

        const doc = createDocument(insertData);
        
        return JSON.stringify({
          success: true,
          message: `Created document "${doc.title}"`,
          document: {
            id: doc.id,
            title: doc.title,
            type: doc.type,
            folderId: doc.folderId,
          },
        });
      }

      case "update_document": {
        const { document_id, title, content, append_content } = args as unknown as UpdateDocumentArgs;
        
        const existingDoc = getDocument(document_id);
        if (!existingDoc) {
          return JSON.stringify({ success: false, error: "Document not found" });
        }

        const updateData: Record<string, unknown> = {};
        if (title) updateData.title = title;
        if (content) {
          updateData.content = content;
        } else if (append_content) {
          updateData.content = (existingDoc.content || "") + "\n\n" + append_content;
        }

        const updatedDoc = updateDocument(document_id, updateData);
        
        return JSON.stringify({
          success: true,
          message: `Updated document "${updatedDoc?.title}"`,
          document: {
            id: updatedDoc?.id,
            title: updatedDoc?.title,
            wordCount: updatedDoc?.wordCount,
          },
        });
      }

      case "delete_document": {
        const { document_id } = args as unknown as DeleteDocumentArgs;
        
        const doc = getDocument(document_id);
        if (!doc) {
          return JSON.stringify({ success: false, error: "Document not found" });
        }

        const title = doc.title;
        const deleted = dbDeleteDocument(document_id);
        
        return JSON.stringify({
          success: deleted,
          message: deleted ? `Deleted document "${title}"` : "Failed to delete document",
        });
      }

      case "create_folder": {
        const { name, parent_folder_id, color } = args as unknown as CreateFolderArgs;
        
        const insertData: InsertFolder = {
          name,
          parentId: parent_folder_id || null,
          color: color || "#3b82f6",
        };

        const folder = createFolder(insertData);
        
        return JSON.stringify({
          success: true,
          message: `Created folder "${folder.name}"`,
          folder: {
            id: folder.id,
            name: folder.name,
            color: folder.color,
          },
        });
      }

      case "delete_folder": {
        const { folder_id, confirmed } = args as unknown as DeleteFolderArgs;
        
        const folder = getFolder(folder_id);
        if (!folder) {
          return JSON.stringify({ success: false, error: "Folder not found" });
        }

        const documentsInFolder = getDocumentsByFolder(folder_id);
        const documentCount = documentsInFolder.length;

        if (documentCount > 0 && !confirmed) {
          return JSON.stringify({
            success: false,
            requires_confirmation: true,
            message: `Folder "${folder.name}" contains ${documentCount} document(s). Documents will be moved to root level. Please confirm with the user before deleting.`,
            folder_name: folder.name,
            document_count: documentCount,
          });
        }

        const folderName = folder.name;
        const deleted = dbDeleteFolder(folder_id);
        
        return JSON.stringify({
          success: deleted,
          message: deleted 
            ? `Deleted folder "${folderName}"${documentCount > 0 ? ` (${documentCount} documents moved to root)` : ""}`
            : "Failed to delete folder",
        });
      }

      case "move_document": {
        const { document_id, target_folder_id } = args as unknown as MoveDocumentArgs;
        
        const doc = getDocument(document_id);
        if (!doc) {
          return JSON.stringify({ success: false, error: "Document not found" });
        }

        const folderId = target_folder_id === "root" ? null : (target_folder_id || null);
        
        if (folderId) {
          const targetFolder = getFolder(folderId);
          if (!targetFolder) {
            return JSON.stringify({ success: false, error: "Target folder not found" });
          }
        }

        const updatedDoc = updateDocument(document_id, { folderId });
        const targetName = folderId ? getFolder(folderId)?.name : "root";
        
        return JSON.stringify({
          success: true,
          message: `Moved "${updatedDoc?.title}" to ${targetName}`,
        });
      }

      case "search_documents": {
        const { query } = args as unknown as SearchDocumentsArgs;
        
        const results = dbSearchDocuments(query);
        const simplifiedResults = results.map(d => ({
          id: d.id,
          title: d.title,
          type: d.type,
          wordCount: d.wordCount,
          folderId: d.folderId,
          preview: d.content?.substring(0, 200) + (d.content && d.content.length > 200 ? "..." : ""),
        }));

        return JSON.stringify({
          success: true,
          query,
          results: simplifiedResults,
          count: simplifiedResults.length,
        });
      }

      default:
        return null;
    }
  } catch (error: any) {
    console.error(`Document tool error (${toolName}):`, error);
    return JSON.stringify({ success: false, error: error.message || "Tool execution failed" });
  }
}

export const documentToolNames = [
  "list_all_folders",
  "list_documents",
  "read_document",
  "create_document",
  "update_document",
  "delete_document",
  "create_folder",
  "delete_folder",
  "move_document",
  "search_documents",
];
