/**
 * Grocery Capability Tests
 *
 * Tests the grocery tool definitions and execution functions for
 * adding, listing, marking, and managing grocery items.
 *
 * Run with: npx vitest server/__tests__/capabilities/grocery.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database functions - must be before imports
vi.mock("../../db", () => ({
  createGroceryItem: vi.fn(),
  getAllGroceryItems: vi.fn(),
  toggleGroceryItemPurchased: vi.fn(),
  deleteGroceryItem: vi.fn(),
  clearPurchasedGroceryItems: vi.fn(),
  clearAllGroceryItems: vi.fn(),
  findContactsByName: vi.fn(),
}));

// Mock workflows - must fully mock the module including OpenAI client creation
vi.mock("../../capabilities/workflows", () => ({
  suggestRelatedGroceryItems: vi.fn(),
  suggestRelatedGroceryItemsBulk: vi.fn(),
}));

// Mock the schema to avoid MASTER_ADMIN_PHONE issues
vi.mock("@shared/schema", () => ({
  MASTER_ADMIN_PHONE: "+15551234567",
}));

import {
  groceryToolDefinitions,
  groceryToolPermissions,
  executeGroceryTool,
  groceryToolNames,
} from "../../capabilities/grocery";
import {
  createGroceryItem,
  getAllGroceryItems,
  toggleGroceryItemPurchased,
  deleteGroceryItem,
  clearPurchasedGroceryItems,
  clearAllGroceryItems,
  findContactsByName,
} from "../../db";
import {
  suggestRelatedGroceryItems,
  suggestRelatedGroceryItemsBulk,
} from "../../capabilities/workflows";

describe("Grocery Capability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Tool Definitions", () => {
    it("should define all expected grocery tools", () => {
      const toolNames = groceryToolDefinitions.map((t) => t.function.name);

      expect(toolNames).toContain("add_grocery_item");
      expect(toolNames).toContain("list_grocery_items");
      expect(toolNames).toContain("mark_grocery_purchased");
      expect(toolNames).toContain("remove_grocery_item");
      expect(toolNames).toContain("clear_purchased_groceries");
      expect(toolNames).toContain("clear_all_groceries");
      expect(toolNames).toContain("suggest_grocery_items");
      expect(toolNames).toContain("send_grocery_list");
    });

    it("should have required parameters defined for add_grocery_item", () => {
      const addTool = groceryToolDefinitions.find(
        (t) => t.function.name === "add_grocery_item"
      );

      expect(addTool).toBeDefined();
      expect(addTool?.function.parameters).toHaveProperty("properties");
      expect(addTool?.function.parameters.required).toContain("name");
    });

    it("should export consistent tool names array", () => {
      const definedNames = groceryToolDefinitions.map((t) => t.function.name);
      expect(groceryToolNames).toEqual(definedNames);
    });
  });

  describe("Tool Permissions", () => {
    it("should require grocery access for all grocery tools", () => {
      const withGroceryAccess = { canAccessGrocery: true, canSendMessages: false };
      const withoutGroceryAccess = { canAccessGrocery: false, canSendMessages: false };

      expect(groceryToolPermissions.add_grocery_item(withGroceryAccess as any)).toBe(true);
      expect(groceryToolPermissions.add_grocery_item(withoutGroceryAccess as any)).toBe(false);
      expect(groceryToolPermissions.list_grocery_items(withGroceryAccess as any)).toBe(true);
      expect(groceryToolPermissions.list_grocery_items(withoutGroceryAccess as any)).toBe(false);
    });

    it("should require both grocery access and send messages for send_grocery_list", () => {
      const fullAccess = { canAccessGrocery: true, canSendMessages: true };
      const groceryOnly = { canAccessGrocery: true, canSendMessages: false };
      const messagesOnly = { canAccessGrocery: false, canSendMessages: true };

      expect(groceryToolPermissions.send_grocery_list(fullAccess as any)).toBe(true);
      expect(groceryToolPermissions.send_grocery_list(groceryOnly as any)).toBe(false);
      expect(groceryToolPermissions.send_grocery_list(messagesOnly as any)).toBe(false);
    });
  });

  describe("executeGroceryTool", () => {
    describe("add_grocery_item", () => {
      it("should add a new grocery item successfully", async () => {
        vi.mocked(getAllGroceryItems).mockResolvedValue([]);
        vi.mocked(createGroceryItem).mockResolvedValue({
          id: "item-123",
          name: "Milk",
          quantity: "1 gallon",
          category: "Dairy",
          addedBy: "Nate",
          purchased: false,
          purchasedAt: null,
          createdAt: new Date().toISOString(),
        });

        const result = await executeGroceryTool("add_grocery_item", {
          name: "Milk",
          quantity: "1 gallon",
          category: "Dairy",
          added_by: "Nate",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.item.name).toBe("Milk");
        expect(createGroceryItem).toHaveBeenCalledWith({
          name: "Milk",
          quantity: "1 gallon",
          category: "Dairy",
          addedBy: "Nate",
        });
      });

      it("should detect exact duplicate items", async () => {
        vi.mocked(getAllGroceryItems).mockResolvedValue([
          {
            id: "existing-123",
            name: "Milk",
            quantity: "1 gallon",
            category: "Dairy",
            addedBy: "Nate",
            purchased: false,
          },
        ]);

        const result = await executeGroceryTool("add_grocery_item", {
          name: "Milk",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(false);
        expect(parsed.duplicate).toBe(true);
        expect(createGroceryItem).not.toHaveBeenCalled();
      });

      it("should detect case-insensitive duplicates", async () => {
        vi.mocked(getAllGroceryItems).mockResolvedValue([
          {
            id: "existing-123",
            name: "MILK",
            quantity: "1 gallon",
            category: "Dairy",
            addedBy: "Nate",
            purchased: false,
          },
        ]);

        const result = await executeGroceryTool("add_grocery_item", {
          name: "milk",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(false);
        expect(parsed.duplicate).toBe(true);
      });

      it("should allow adding item when similar item is already purchased", async () => {
        vi.mocked(getAllGroceryItems).mockResolvedValue([
          {
            id: "existing-123",
            name: "Milk",
            quantity: "1 gallon",
            category: "Dairy",
            addedBy: "Nate",
            purchased: true, // Already purchased
          },
        ]);
        vi.mocked(createGroceryItem).mockResolvedValue({
          id: "new-123",
          name: "Milk",
          quantity: "1",
          category: "Other",
          addedBy: "Nate",
          purchased: false,
          purchasedAt: null,
          createdAt: new Date().toISOString(),
        });

        const result = await executeGroceryTool("add_grocery_item", {
          name: "Milk",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
      });

      it("should warn about similar items without blocking", async () => {
        // Setup: existing item "Milk" and adding "Skim Milk" (contains "Milk")
        vi.mocked(getAllGroceryItems).mockResolvedValue([
          {
            id: "existing-123",
            name: "Milk",
            quantity: "1 gallon",
            category: "Dairy",
            addedBy: "Nate",
            purchased: false,
          },
        ]);
        vi.mocked(createGroceryItem).mockResolvedValue({
          id: "new-123",
          name: "Skim Milk",
          quantity: "1",
          category: "Dairy",
          addedBy: "Nate",
          purchased: false,
          purchasedAt: null,
          createdAt: new Date().toISOString(),
        });

        const result = await executeGroceryTool("add_grocery_item", {
          name: "Skim Milk",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        // "Milk" is contained in "Skim Milk", so should show warning
        expect(parsed.warning).toContain("Similar items");
        expect(parsed.similarItems).toBeDefined();
      });

      it("should use default values when optional params not provided", async () => {
        vi.mocked(getAllGroceryItems).mockResolvedValue([]);
        vi.mocked(createGroceryItem).mockResolvedValue({
          id: "item-123",
          name: "Eggs",
          quantity: "1",
          category: "Other",
          addedBy: "Nate",
          purchased: false,
          purchasedAt: null,
          createdAt: new Date().toISOString(),
        });

        await executeGroceryTool("add_grocery_item", {
          name: "Eggs",
        });

        expect(createGroceryItem).toHaveBeenCalledWith({
          name: "Eggs",
          quantity: "1",
          category: "Other",
          addedBy: "Nate",
        });
      });
    });

    describe("list_grocery_items", () => {
      it("should return empty list message when no items", async () => {
        vi.mocked(getAllGroceryItems).mockResolvedValue([]);

        const result = await executeGroceryTool("list_grocery_items", {});

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.message).toBe("The grocery list is empty");
        expect(parsed.to_buy).toEqual([]);
        expect(parsed.purchased).toEqual([]);
      });

      it("should separate items into to_buy and purchased lists", async () => {
        vi.mocked(getAllGroceryItems).mockResolvedValue([
          { id: "1", name: "Milk", quantity: "1", category: "Dairy", addedBy: "Nate", purchased: false },
          { id: "2", name: "Bread", quantity: "1", category: "Bakery", addedBy: "Nate", purchased: true },
          { id: "3", name: "Eggs", quantity: "1 dozen", category: "Dairy", addedBy: "Nate", purchased: false },
        ]);

        const result = await executeGroceryTool("list_grocery_items", {});

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.to_buy).toHaveLength(2);
        expect(parsed.purchased).toHaveLength(1);
        expect(parsed.summary).toBe("2 item(s) to buy, 1 already purchased");
      });
    });

    describe("mark_grocery_purchased", () => {
      it("should mark an item as purchased with partial name match", async () => {
        vi.mocked(getAllGroceryItems).mockResolvedValue([
          { id: "1", name: "Whole Milk", quantity: "1", category: "Dairy", addedBy: "Nate", purchased: false },
        ]);
        vi.mocked(toggleGroceryItemPurchased).mockResolvedValue({
          id: "1",
          name: "Whole Milk",
          quantity: "1",
          category: "Dairy",
          addedBy: "Nate",
          purchased: true,
          purchasedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });

        const result = await executeGroceryTool("mark_grocery_purchased", {
          item_name: "milk",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.item.purchased).toBe(true);
        expect(toggleGroceryItemPurchased).toHaveBeenCalledWith("1");
      });

      it("should return error when item not found", async () => {
        vi.mocked(getAllGroceryItems).mockResolvedValue([
          { id: "1", name: "Bread", quantity: "1", category: "Bakery", addedBy: "Nate", purchased: false },
        ]);

        const result = await executeGroceryTool("mark_grocery_purchased", {
          item_name: "milk",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain("No item matching");
      });

      it("should toggle item back to unpurchased", async () => {
        vi.mocked(getAllGroceryItems).mockResolvedValue([
          { id: "1", name: "Milk", quantity: "1", category: "Dairy", addedBy: "Nate", purchased: true },
        ]);
        vi.mocked(toggleGroceryItemPurchased).mockResolvedValue({
          id: "1",
          name: "Milk",
          quantity: "1",
          category: "Dairy",
          addedBy: "Nate",
          purchased: false,
          purchasedAt: null,
          createdAt: new Date().toISOString(),
        });

        const result = await executeGroceryTool("mark_grocery_purchased", {
          item_name: "milk",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.item.purchased).toBe(false);
        expect(parsed.message).toContain("not purchased");
      });
    });

    describe("remove_grocery_item", () => {
      it("should remove an item successfully", async () => {
        vi.mocked(getAllGroceryItems).mockResolvedValue([
          { id: "1", name: "Old Bread", quantity: "1", category: "Bakery", addedBy: "Nate", purchased: false },
        ]);
        vi.mocked(deleteGroceryItem).mockResolvedValue(true);

        const result = await executeGroceryTool("remove_grocery_item", {
          item_name: "bread",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.message).toContain("Removed");
        expect(deleteGroceryItem).toHaveBeenCalledWith("1");
      });

      it("should return error when item not found", async () => {
        vi.mocked(getAllGroceryItems).mockResolvedValue([]);

        const result = await executeGroceryTool("remove_grocery_item", {
          item_name: "nonexistent",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain("No item matching");
      });
    });

    describe("clear_purchased_groceries", () => {
      it("should clear purchased items and return count", async () => {
        vi.mocked(clearPurchasedGroceryItems).mockResolvedValue(5);

        const result = await executeGroceryTool("clear_purchased_groceries", {});

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.items_cleared).toBe(5);
        expect(parsed.message).toContain("5 purchased item(s)");
      });

      it("should handle case when no items to clear", async () => {
        vi.mocked(clearPurchasedGroceryItems).mockResolvedValue(0);

        const result = await executeGroceryTool("clear_purchased_groceries", {});

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.items_cleared).toBe(0);
        expect(parsed.message).toBe("No purchased items to clear");
      });
    });

    describe("clear_all_groceries", () => {
      it("should clear all items and return count", async () => {
        vi.mocked(clearAllGroceryItems).mockResolvedValue(10);

        const result = await executeGroceryTool("clear_all_groceries", {});

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.items_cleared).toBe(10);
        expect(parsed.message).toContain("10 item(s)");
        expect(parsed.message).toContain("now empty");
      });

      it("should handle already empty list", async () => {
        vi.mocked(clearAllGroceryItems).mockResolvedValue(0);

        const result = await executeGroceryTool("clear_all_groceries", {});

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.message).toBe("The grocery list was already empty");
      });
    });

    describe("suggest_grocery_items", () => {
      it("should suggest items for single item", async () => {
        vi.mocked(getAllGroceryItems).mockResolvedValue([]);
        vi.mocked(suggestRelatedGroceryItems).mockResolvedValue({
          suggestions: ["Parmesan Cheese", "Garlic", "Olive Oil"],
          mealIdeas: ["Pasta Carbonara", "Spaghetti Bolognese"],
        });

        const result = await executeGroceryTool("suggest_grocery_items", {
          item: "pasta",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.suggestions).toHaveLength(3);
        expect(parsed.mealIdeas).toHaveLength(2);
        expect(suggestRelatedGroceryItems).toHaveBeenCalledWith("pasta", []);
      });

      it("should suggest items for multiple items", async () => {
        vi.mocked(getAllGroceryItems).mockResolvedValue([
          { name: "Butter", purchased: false },
        ]);
        vi.mocked(suggestRelatedGroceryItemsBulk).mockResolvedValue({
          suggestions: ["Heavy Cream", "Eggs"],
          mealIdeas: ["Tacos", "Burritos"],
        });

        const result = await executeGroceryTool("suggest_grocery_items", {
          items: ["Ground Beef", "Tortillas", "Cheese"],
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(suggestRelatedGroceryItemsBulk).toHaveBeenCalledWith(
          ["Ground Beef", "Tortillas", "Cheese"],
          ["Butter"]
        );
      });

      it("should return error when no item provided", async () => {
        const result = await executeGroceryTool("suggest_grocery_items", {});

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain("Please provide");
      });
    });

    describe("send_grocery_list", () => {
      it("should return error when SMS not configured", async () => {
        const result = await executeGroceryTool("send_grocery_list", {
          recipients: ["Nate"],
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain("SMS is not configured");
      });

      it("should return error when grocery list is empty", async () => {
        vi.mocked(getAllGroceryItems).mockResolvedValue([]);

        const mockSms = vi.fn().mockResolvedValue(undefined);
        const result = await executeGroceryTool(
          "send_grocery_list",
          { recipients: ["Nate"] },
          { sendSmsCallback: mockSms }
        );

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain("grocery list is empty");
      });

      it("should return error when no recipients specified", async () => {
        vi.mocked(getAllGroceryItems).mockResolvedValue([
          { id: "1", name: "Milk", quantity: "1", category: "Dairy", addedBy: "Nate", purchased: false },
        ]);

        const mockSms = vi.fn().mockResolvedValue(undefined);
        const result = await executeGroceryTool(
          "send_grocery_list",
          { recipients: [] },
          { sendSmsCallback: mockSms }
        );

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain("No recipients");
      });

      it("should send grocery list to 'me' using master phone", async () => {
        vi.mocked(getAllGroceryItems).mockResolvedValue([
          { id: "1", name: "Milk", quantity: "1 gallon", category: "Dairy", addedBy: "Nate", purchased: false },
          { id: "2", name: "Bread", quantity: "1", category: "Bakery", addedBy: "Nate", purchased: false },
        ]);

        const mockSms = vi.fn().mockResolvedValue(undefined);
        const result = await executeGroceryTool(
          "send_grocery_list",
          { recipients: ["me"] },
          { sendSmsCallback: mockSms }
        );

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.sentTo).toContain("me");
        expect(mockSms).toHaveBeenCalled();

        // Verify the message format
        const sentMessage = mockSms.mock.calls[0][1];
        expect(sentMessage).toContain("Grocery List:");
        expect(sentMessage).toContain("Dairy:");
        expect(sentMessage).toContain("Milk");
        expect(sentMessage).toContain("2 item(s) total");
      });

      it("should look up contact phone number for named recipient", async () => {
        vi.mocked(getAllGroceryItems).mockResolvedValue([
          { id: "1", name: "Milk", quantity: "1", category: "Dairy", addedBy: "Nate", purchased: false },
        ]);
        vi.mocked(findContactsByName).mockResolvedValue([
          { id: "contact-1", name: "Shakita", phoneNumber: "+15551234567" },
        ]);

        const mockSms = vi.fn().mockResolvedValue(undefined);
        const result = await executeGroceryTool(
          "send_grocery_list",
          { recipients: ["Shakita"] },
          { sendSmsCallback: mockSms }
        );

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(findContactsByName).toHaveBeenCalledWith("Shakita");
        expect(mockSms).toHaveBeenCalledWith(
          "+15551234567",
          expect.any(String),
          "grocery_list"
        );
      });

      it("should report failed recipients when contact not found", async () => {
        vi.mocked(getAllGroceryItems).mockResolvedValue([
          { id: "1", name: "Milk", quantity: "1", category: "Dairy", addedBy: "Nate", purchased: false },
        ]);
        vi.mocked(findContactsByName).mockResolvedValue([]);

        const mockSms = vi.fn().mockResolvedValue(undefined);
        const result = await executeGroceryTool(
          "send_grocery_list",
          { recipients: ["UnknownPerson"] },
          { sendSmsCallback: mockSms }
        );

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain("No phone numbers found");
      });
    });

    describe("unknown tool", () => {
      it("should return null for unknown tool names", async () => {
        const result = await executeGroceryTool("unknown_tool", {});
        expect(result).toBeNull();
      });
    });

    describe("error handling", () => {
      it("should handle database errors gracefully", async () => {
        vi.mocked(getAllGroceryItems).mockRejectedValue(new Error("DB Error"));

        const result = await executeGroceryTool("list_grocery_items", {});

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.error).toBeDefined();
      });
    });
  });
});
