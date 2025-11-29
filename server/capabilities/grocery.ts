import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import { 
  createGroceryItem, 
  getAllGroceryItems, 
  toggleGroceryItemPurchased, 
  deleteGroceryItem,
  clearPurchasedGroceryItems,
  clearAllGroceryItems,
} from "../db";

export const groceryToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "add_grocery_item",
      description: "Add an item to the shared grocery list. The grocery list is shared between Nate, Shakita, and ZEKE.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name of the grocery item to add",
          },
          quantity: {
            type: "string",
            description: "The quantity (e.g., '1', '2 lbs', '1 dozen'). Default is '1'.",
          },
          category: {
            type: "string",
            enum: ["Produce", "Dairy", "Meat", "Bakery", "Frozen", "Beverages", "Snacks", "Household", "Other"],
            description: "The category of the item. Default is 'Other'.",
          },
          added_by: {
            type: "string",
            enum: ["Nate", "ZEKE", "Shakita"],
            description: "Who is adding this item. Use 'Nate' for items Nate requests, 'ZEKE' if you're adding it proactively, 'Shakita' if she requests it.",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_grocery_items",
      description: "List all items on the grocery list, showing what needs to be bought and what's already purchased.",
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
      name: "mark_grocery_purchased",
      description: "Mark a grocery item as purchased (or toggle back to unpurchased).",
      parameters: {
        type: "object",
        properties: {
          item_name: {
            type: "string",
            description: "The name of the item to mark as purchased (partial match is supported).",
          },
        },
        required: ["item_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_grocery_item",
      description: "Remove an item from the grocery list entirely.",
      parameters: {
        type: "object",
        properties: {
          item_name: {
            type: "string",
            description: "The name of the item to remove (partial match is supported).",
          },
        },
        required: ["item_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_purchased_groceries",
      description: "Clear all purchased items from the grocery list.",
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
      name: "clear_all_groceries",
      description: "Clear ALL items from the grocery list entirely. Use when user says 'clear the list', 'empty the list', 'start fresh', or 'got them all'.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

export const groceryToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  add_grocery_item: (p) => p.canAccessGrocery,
  list_grocery_items: (p) => p.canAccessGrocery,
  mark_grocery_purchased: (p) => p.canAccessGrocery,
  remove_grocery_item: (p) => p.canAccessGrocery,
  clear_purchased_groceries: (p) => p.canAccessGrocery,
  clear_all_groceries: (p) => p.canAccessGrocery,
};

export async function executeGroceryTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  switch (toolName) {
    case "add_grocery_item": {
      const { name, quantity, category, added_by } = args as {
        name: string;
        quantity?: string;
        category?: string;
        added_by?: string;
      };
      
      try {
        const item = createGroceryItem({
          name,
          quantity: quantity || "1",
          category: category || "Other",
          addedBy: added_by || "Nate",
        });
        
        return JSON.stringify({
          success: true,
          message: `Added "${name}" to the grocery list`,
          item: {
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            category: item.category,
            addedBy: item.addedBy,
          },
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: "Failed to add item to grocery list" });
      }
    }
    
    case "list_grocery_items": {
      try {
        const items = getAllGroceryItems();
        const toBuy = items.filter(i => !i.purchased);
        const purchased = items.filter(i => i.purchased);
        
        if (items.length === 0) {
          return JSON.stringify({
            message: "The grocery list is empty",
            to_buy: [],
            purchased: [],
          });
        }
        
        return JSON.stringify({
          to_buy: toBuy.map(i => ({
            id: i.id,
            name: i.name,
            quantity: i.quantity,
            category: i.category,
            addedBy: i.addedBy,
          })),
          purchased: purchased.map(i => ({
            id: i.id,
            name: i.name,
            quantity: i.quantity,
          })),
          summary: `${toBuy.length} item(s) to buy, ${purchased.length} already purchased`,
        });
      } catch (error) {
        return JSON.stringify({ error: "Failed to get grocery list" });
      }
    }
    
    case "mark_grocery_purchased": {
      const { item_name } = args as { item_name: string };
      
      try {
        const items = getAllGroceryItems();
        const searchLower = item_name.toLowerCase();
        const match = items.find(i => i.name.toLowerCase().includes(searchLower));
        
        if (!match) {
          return JSON.stringify({ 
            success: false, 
            error: `No item matching "${item_name}" found on the grocery list` 
          });
        }
        
        const updated = toggleGroceryItemPurchased(match.id);
        if (updated) {
          return JSON.stringify({
            success: true,
            message: updated.purchased 
              ? `Marked "${updated.name}" as purchased` 
              : `Marked "${updated.name}" as not purchased`,
            item: {
              name: updated.name,
              purchased: updated.purchased,
            },
          });
        }
        
        return JSON.stringify({ success: false, error: "Failed to update item" });
      } catch (error) {
        return JSON.stringify({ success: false, error: "Failed to update grocery item" });
      }
    }
    
    case "remove_grocery_item": {
      const { item_name } = args as { item_name: string };
      
      try {
        const items = getAllGroceryItems();
        const searchLower = item_name.toLowerCase();
        const match = items.find(i => i.name.toLowerCase().includes(searchLower));
        
        if (!match) {
          return JSON.stringify({ 
            success: false, 
            error: `No item matching "${item_name}" found on the grocery list` 
          });
        }
        
        const deleted = deleteGroceryItem(match.id);
        if (deleted) {
          return JSON.stringify({
            success: true,
            message: `Removed "${match.name}" from the grocery list`,
          });
        }
        
        return JSON.stringify({ success: false, error: "Failed to remove item" });
      } catch (error) {
        return JSON.stringify({ success: false, error: "Failed to remove grocery item" });
      }
    }
    
    case "clear_purchased_groceries": {
      try {
        const count = clearPurchasedGroceryItems();
        return JSON.stringify({
          success: true,
          message: count > 0 
            ? `Cleared ${count} purchased item(s) from the grocery list`
            : "No purchased items to clear",
          items_cleared: count,
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: "Failed to clear purchased items" });
      }
    }
    
    case "clear_all_groceries": {
      try {
        const count = clearAllGroceryItems();
        return JSON.stringify({
          success: true,
          message: count > 0 
            ? `Cleared all ${count} item(s) from the grocery list. List is now empty.`
            : "The grocery list was already empty",
          items_cleared: count,
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: "Failed to clear grocery list" });
      }
    }
    
    default:
      return null;
  }
}

export const groceryToolNames = [
  "add_grocery_item",
  "list_grocery_items",
  "mark_grocery_purchased",
  "remove_grocery_item",
  "clear_purchased_groceries",
  "clear_all_groceries",
];
