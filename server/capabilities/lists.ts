import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import type { CustomList } from "@shared/schema";
import { 
  createCustomList, 
  getAllCustomLists, 
  getCustomList,
  getCustomListWithItems,
  createCustomListItem,
  toggleCustomListItemChecked,
  deleteCustomListItem,
  clearCheckedCustomListItems,
  deleteCustomList,
  getCustomListItems,
} from "../db";

export const listToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_list",
      description: "Create a new custom list for tracking items. Can be used for todo lists, packing lists, shopping lists, wishlists, or custom lists.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name of the list (e.g., 'Trip Packing', 'Christmas Gifts', 'Home Renovation Tasks')",
          },
          type: {
            type: "string",
            enum: ["todo", "packing", "shopping", "wishlist", "custom"],
            description: "The type of list. Default is 'custom'.",
          },
          is_shared: {
            type: "boolean",
            description: "Whether this list should be shared with family members. Default is false.",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_lists",
      description: "Show all available custom lists.",
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
      name: "add_list_item",
      description: "Add an item to a specific custom list.",
      parameters: {
        type: "object",
        properties: {
          list_name: {
            type: "string",
            description: "The name of the list to add the item to (partial match is supported).",
          },
          content: {
            type: "string",
            description: "The content/description of the item to add.",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "The priority of the item. Default is 'medium'.",
          },
          notes: {
            type: "string",
            description: "Optional notes for the item.",
          },
          added_by: {
            type: "string",
            description: "Who is adding this item.",
          },
        },
        required: ["list_name", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "view_list",
      description: "View all items in a specific list.",
      parameters: {
        type: "object",
        properties: {
          list_name: {
            type: "string",
            description: "The name of the list to view (partial match is supported).",
          },
        },
        required: ["list_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_list_item",
      description: "Mark an item as checked/unchecked in a list (toggle).",
      parameters: {
        type: "object",
        properties: {
          list_name: {
            type: "string",
            description: "The name of the list containing the item (partial match is supported).",
          },
          item_content: {
            type: "string",
            description: "The content of the item to check/uncheck (partial match is supported).",
          },
        },
        required: ["list_name", "item_content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_list_item",
      description: "Remove an item from a list entirely.",
      parameters: {
        type: "object",
        properties: {
          list_name: {
            type: "string",
            description: "The name of the list containing the item (partial match is supported).",
          },
          item_content: {
            type: "string",
            description: "The content of the item to remove (partial match is supported).",
          },
        },
        required: ["list_name", "item_content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_list_checked",
      description: "Clear all checked items from a list.",
      parameters: {
        type: "object",
        properties: {
          list_name: {
            type: "string",
            description: "The name of the list to clear checked items from (partial match is supported).",
          },
        },
        required: ["list_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_list",
      description: "Delete an entire list and all its items.",
      parameters: {
        type: "object",
        properties: {
          list_name: {
            type: "string",
            description: "The name of the list to delete (partial match is supported).",
          },
        },
        required: ["list_name"],
      },
    },
  },
];

// Global permission check for list tools - determines if user can access list features at all
// Per-list permission checks are done in executeListTool based on list's isShared flag
export const listToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  // Creating lists: admins or users with grocery access can create lists
  create_list: (p) => p.isAdmin || p.canAccessGrocery,
  // Listing all lists: show available lists (filtering done per-list)
  list_lists: (p) => p.isAdmin || p.canAccessGrocery,
  // Operations on specific lists require per-list checks in executeListTool
  add_list_item: (p) => p.isAdmin || p.canAccessGrocery,
  view_list: (p) => p.isAdmin || p.canAccessGrocery,
  check_list_item: (p) => p.isAdmin || p.canAccessGrocery,
  remove_list_item: (p) => p.isAdmin || p.canAccessGrocery,
  clear_list_checked: (p) => p.isAdmin || p.canAccessGrocery,
  // Deleting lists: admin only for non-shared lists (checked in executeListTool)
  delete_list: (p) => p.isAdmin || p.canAccessGrocery,
};

// Check if user has permission to access a specific list
// - Admins can access all lists
// - Shared lists (isShared: true) can be accessed by users with canAccessGrocery
// - Non-shared lists can only be accessed by admins
function checkListPermission(
  list: CustomList,
  permissions: ToolPermissions,
  action: "read" | "write" | "delete"
): { allowed: boolean; reason?: string } {
  // Admins have full access to all lists
  if (permissions.isAdmin) {
    return { allowed: true };
  }
  
  // For shared lists, family members with grocery access can read/write
  if (list.isShared) {
    if (permissions.canAccessGrocery) {
      // Shared lists allow read/write but not delete for non-admins
      if (action === "delete") {
        return { 
          allowed: false, 
          reason: "Only administrators can delete shared lists" 
        };
      }
      return { allowed: true };
    }
  }
  
  // Non-shared lists are admin-only
  return { 
    allowed: false, 
    reason: list.isShared 
      ? "You don't have permission to access this shared list"
      : "This list is private and can only be accessed by the owner" 
  };
}

function findListByName(name: string): CustomList | null {
  const lists = getAllCustomLists();
  const searchLower = name.toLowerCase();
  const match = lists.find(l => l.name.toLowerCase().includes(searchLower));
  return match || null;
}

// Find list with permission check
function findListWithPermission(
  name: string,
  permissions: ToolPermissions,
  action: "read" | "write" | "delete"
): { list: CustomList; error?: undefined } | { list?: undefined; error: string } {
  const list = findListByName(name);
  if (!list) {
    return { error: `No list matching "${name}" found. Use list_lists to see available lists.` };
  }
  
  const permCheck = checkListPermission(list, permissions, action);
  if (!permCheck.allowed) {
    console.log(`[LIST PERMISSION] Access denied for list "${list.name}" (id: ${list.id}), action: ${action}, reason: ${permCheck.reason}`);
    return { error: permCheck.reason || "Access denied" };
  }
  
  return { list };
}

// Default admin permissions for backward compatibility when permissions not provided
const defaultAdminPermissions: ToolPermissions = {
  isAdmin: true,
  canAccessPersonalInfo: true,
  canAccessCalendar: true,
  canAccessTasks: true,
  canAccessGrocery: true,
  canSetReminders: true,
  canQueryMemory: true,
};

export async function executeListTool(
  toolName: string,
  args: Record<string, unknown>,
  permissions?: ToolPermissions
): Promise<string | null> {
  // Use provided permissions or default to admin (for backward compatibility)
  const effectivePermissions = permissions || defaultAdminPermissions;
  
  switch (toolName) {
    case "create_list": {
      const { name, type, is_shared } = args as {
        name: string;
        type?: string;
        is_shared?: boolean;
      };
      
      // Non-admins can only create shared lists
      if (!effectivePermissions.isAdmin && !is_shared) {
        console.log(`[LIST PERMISSION] Non-admin attempted to create private list "${name}"`);
        return JSON.stringify({
          success: false,
          error: "You can only create shared lists. Set is_shared to true.",
        });
      }
      
      try {
        const list = createCustomList({
          name,
          type: (type as "todo" | "packing" | "shopping" | "wishlist" | "custom") || "custom",
          isShared: is_shared || false,
        });
        
        console.log(`[LIST] Created list "${name}" (id: ${list.id}, shared: ${list.isShared}) by ${effectivePermissions.isAdmin ? 'admin' : 'user'}`);
        
        return JSON.stringify({
          success: true,
          message: `Created new list "${name}"`,
          list: {
            id: list.id,
            name: list.name,
            type: list.type,
            isShared: list.isShared,
          },
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: "Failed to create list" });
      }
    }
    
    case "list_lists": {
      try {
        const allLists = getAllCustomLists();
        
        // Filter lists based on permissions
        // Admins see all lists, others only see shared lists
        const visibleLists = allLists.filter(l => {
          if (effectivePermissions.isAdmin) return true;
          return l.isShared && effectivePermissions.canAccessGrocery;
        });
        
        if (visibleLists.length === 0) {
          return JSON.stringify({
            message: effectivePermissions.isAdmin 
              ? "No custom lists found. You can create one with create_list."
              : "No shared lists available. Ask an admin to create or share a list.",
            lists: [],
          });
        }
        
        const listsWithCounts = visibleLists.map(l => {
          const items = getCustomListItems(l.id);
          const unchecked = items.filter(i => !i.checked).length;
          const checked = items.filter(i => i.checked).length;
          return {
            id: l.id,
            name: l.name,
            type: l.type,
            isShared: l.isShared,
            itemCount: items.length,
            uncheckedCount: unchecked,
            checkedCount: checked,
          };
        });
        
        console.log(`[LIST] Listed ${visibleLists.length} lists (${allLists.length} total) for ${effectivePermissions.isAdmin ? 'admin' : 'user'}`);
        
        return JSON.stringify({
          lists: listsWithCounts,
          summary: `${visibleLists.length} list(s) available`,
        });
      } catch (error) {
        return JSON.stringify({ error: "Failed to get lists" });
      }
    }
    
    case "add_list_item": {
      const { list_name, content, priority, notes, added_by } = args as {
        list_name: string;
        content: string;
        priority?: string;
        notes?: string;
        added_by?: string;
      };
      
      try {
        const result = findListWithPermission(list_name, effectivePermissions, "write");
        if (result.error) {
          return JSON.stringify({ success: false, error: result.error });
        }
        const list = result.list!;
        
        const item = createCustomListItem({
          listId: list.id,
          content,
          priority: (priority as "low" | "medium" | "high") || "medium",
          notes: notes || null,
          addedBy: added_by || null,
        });
        
        console.log(`[LIST] Added item "${content}" to list "${list.name}" (id: ${list.id})`);
        
        return JSON.stringify({
          success: true,
          message: `Added "${content}" to list "${list.name}"`,
          item: {
            id: item.id,
            content: item.content,
            priority: item.priority,
            listName: list.name,
          },
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: "Failed to add item to list" });
      }
    }
    
    case "view_list": {
      const { list_name } = args as { list_name: string };
      
      try {
        const result = findListWithPermission(list_name, effectivePermissions, "read");
        if (result.error) {
          return JSON.stringify({ success: false, error: result.error });
        }
        const list = result.list!;
        
        const listWithItems = getCustomListWithItems(list.id);
        if (!listWithItems) {
          return JSON.stringify({
            success: false,
            error: "Failed to retrieve list details",
          });
        }
        
        const unchecked = listWithItems.items.filter(i => !i.checked);
        const checked = listWithItems.items.filter(i => i.checked);
        
        console.log(`[LIST] Viewed list "${list.name}" (id: ${list.id}) with ${listWithItems.items.length} items`);
        
        return JSON.stringify({
          list: {
            name: listWithItems.name,
            type: listWithItems.type,
            isShared: listWithItems.isShared,
          },
          unchecked: unchecked.map(i => ({
            id: i.id,
            content: i.content,
            priority: i.priority,
            notes: i.notes,
            addedBy: i.addedBy,
          })),
          checked: checked.map(i => ({
            id: i.id,
            content: i.content,
          })),
          summary: `${unchecked.length} unchecked, ${checked.length} checked`,
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: "Failed to view list" });
      }
    }
    
    case "check_list_item": {
      const { list_name, item_content } = args as { list_name: string; item_content: string };
      
      try {
        const result = findListWithPermission(list_name, effectivePermissions, "write");
        if (result.error) {
          return JSON.stringify({ success: false, error: result.error });
        }
        const list = result.list!;
        
        const items = getCustomListItems(list.id);
        const searchLower = item_content.toLowerCase();
        const match = items.find(i => i.content.toLowerCase().includes(searchLower));
        
        if (!match) {
          return JSON.stringify({
            success: false,
            error: `No item matching "${item_content}" found in list "${list.name}"`,
          });
        }
        
        const updated = toggleCustomListItemChecked(match.id);
        if (updated) {
          console.log(`[LIST] Toggled item "${updated.content}" in list "${list.name}" (checked: ${updated.checked})`);
          return JSON.stringify({
            success: true,
            message: updated.checked
              ? `Checked off "${updated.content}" in list "${list.name}"`
              : `Unchecked "${updated.content}" in list "${list.name}"`,
            item: {
              content: updated.content,
              checked: updated.checked,
            },
          });
        }
        
        return JSON.stringify({ success: false, error: "Failed to update item" });
      } catch (error) {
        return JSON.stringify({ success: false, error: "Failed to check/uncheck item" });
      }
    }
    
    case "remove_list_item": {
      const { list_name, item_content } = args as { list_name: string; item_content: string };
      
      try {
        const result = findListWithPermission(list_name, effectivePermissions, "write");
        if (result.error) {
          return JSON.stringify({ success: false, error: result.error });
        }
        const list = result.list!;
        
        const items = getCustomListItems(list.id);
        const searchLower = item_content.toLowerCase();
        const match = items.find(i => i.content.toLowerCase().includes(searchLower));
        
        if (!match) {
          return JSON.stringify({
            success: false,
            error: `No item matching "${item_content}" found in list "${list.name}"`,
          });
        }
        
        const deleted = deleteCustomListItem(match.id);
        if (deleted) {
          console.log(`[LIST] Removed item "${match.content}" from list "${list.name}"`);
          return JSON.stringify({
            success: true,
            message: `Removed "${match.content}" from list "${list.name}"`,
          });
        }
        
        return JSON.stringify({ success: false, error: "Failed to remove item" });
      } catch (error) {
        return JSON.stringify({ success: false, error: "Failed to remove item from list" });
      }
    }
    
    case "clear_list_checked": {
      const { list_name } = args as { list_name: string };
      
      try {
        const result = findListWithPermission(list_name, effectivePermissions, "write");
        if (result.error) {
          return JSON.stringify({ success: false, error: result.error });
        }
        const list = result.list!;
        
        const count = clearCheckedCustomListItems(list.id);
        console.log(`[LIST] Cleared ${count} checked items from list "${list.name}"`);
        return JSON.stringify({
          success: true,
          message: count > 0
            ? `Cleared ${count} checked item(s) from list "${list.name}"`
            : `No checked items to clear in list "${list.name}"`,
          items_cleared: count,
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: "Failed to clear checked items" });
      }
    }
    
    case "delete_list": {
      const { list_name } = args as { list_name: string };
      
      try {
        // Delete requires special permission check
        const result = findListWithPermission(list_name, effectivePermissions, "delete");
        if (result.error) {
          return JSON.stringify({ success: false, error: result.error });
        }
        const list = result.list!;
        
        const deleted = deleteCustomList(list.id);
        if (deleted) {
          console.log(`[LIST] Deleted list "${list.name}" (id: ${list.id}) by ${effectivePermissions.isAdmin ? 'admin' : 'user'}`);
          return JSON.stringify({
            success: true,
            message: `Deleted list "${list.name}" and all its items`,
          });
        }
        
        return JSON.stringify({ success: false, error: "Failed to delete list" });
      } catch (error) {
        return JSON.stringify({ success: false, error: "Failed to delete list" });
      }
    }
    
    default:
      return null;
  }
}

export const listToolNames = [
  "create_list",
  "list_lists",
  "add_list_item",
  "view_list",
  "check_list_item",
  "remove_list_item",
  "clear_list_checked",
  "delete_list",
];
