import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import {
  upsertFoodPreference,
  createDietaryRestriction,
  createMealHistoryEntry,
  getFoodPreferences,
  getLikedIngredients,
  getDislikedIngredients,
  getDietaryRestrictions,
  getMealHistory,
  getFavoriteRecipes,
  searchRecipes,
  createRecipe,
  getRecipeById,
  createGroceryItem,
  getFamilyMemberByName,
  createFamilyMember,
  getActiveFamilyMembers,
} from "../db";
import type {
  FoodItemType,
  FoodPreferenceLevel,
  DietaryRestrictionType,
  DietaryRestrictionSeverity,
  MealType,
  RecipeMealType,
} from "@shared/schema";

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured.");
    }
    const OpenAI = require("openai").default;
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

export const foodToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "record_food_preference",
      description: "Record what a family member likes or dislikes. Use this to learn food preferences for meal planning.",
      parameters: {
        type: "object",
        properties: {
          member_id: {
            type: "string",
            description: "The name of the family member (e.g., 'Nate', 'Shakita'). Will be created if doesn't exist.",
          },
          item_type: {
            type: "string",
            enum: ["ingredient", "dish", "cuisine"],
            description: "The type of food item - ingredient (e.g., 'mushrooms'), dish (e.g., 'lasagna'), or cuisine (e.g., 'Thai').",
          },
          item_name: {
            type: "string",
            description: "The name of the food item.",
          },
          preference: {
            type: "string",
            enum: ["love", "like", "neutral", "dislike", "allergic"],
            description: "How much they like/dislike it. Use 'allergic' for allergies.",
          },
          notes: {
            type: "string",
            description: "Optional notes about this preference (e.g., 'only fresh, not canned').",
          },
        },
        required: ["member_id", "item_type", "item_name", "preference"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_dietary_restriction",
      description: "Record an allergy or dietary restriction for a family member.",
      parameters: {
        type: "object",
        properties: {
          member_id: {
            type: "string",
            description: "The name of the family member.",
          },
          restriction_type: {
            type: "string",
            enum: ["allergy", "intolerance", "religious", "health", "preference"],
            description: "The type of restriction.",
          },
          restriction_name: {
            type: "string",
            description: "The name of the restriction (e.g., 'peanuts', 'gluten', 'kosher', 'vegetarian').",
          },
          severity: {
            type: "string",
            enum: ["strict", "moderate", "mild"],
            description: "How strict is the restriction. Default is 'strict'.",
          },
          notes: {
            type: "string",
            description: "Optional notes about the restriction.",
          },
        },
        required: ["member_id", "restriction_type", "restriction_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_meal",
      description: "Log a meal that was cooked or eaten. Helps track meal history and avoid repetition.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name of the meal (e.g., 'Spaghetti Bolognese', 'Grilled Salmon').",
          },
          meal_type: {
            type: "string",
            enum: ["breakfast", "lunch", "dinner", "snack"],
            description: "The type of meal.",
          },
          cuisine: {
            type: "string",
            description: "The cuisine type (e.g., 'Italian', 'Mexican', 'American').",
          },
          rating: {
            type: "number",
            minimum: 1,
            maximum: 5,
            description: "Family rating from 1-5 stars.",
          },
          notes: {
            type: "string",
            description: "Optional notes about the meal (e.g., 'Kids loved it', 'Too spicy').",
          },
        },
        required: ["name", "meal_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_food_preferences",
      description: "Get food preferences for family members. Useful for meal planning.",
      parameters: {
        type: "object",
        properties: {
          member_id: {
            type: "string",
            description: "Optional - get preferences for a specific family member by name. Leave empty for all members.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dietary_restrictions",
      description: "Get dietary restrictions and allergies for the family.",
      parameters: {
        type: "object",
        properties: {
          member_id: {
            type: "string",
            description: "Optional - get restrictions for a specific family member by name.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_meal_history",
      description: "Get recent meals that were cooked. Useful for avoiding repetition.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of meals to return. Default is 10.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_recipe",
      description: "Generate a recipe recommendation based on family preferences and restrictions.",
      parameters: {
        type: "object",
        properties: {
          meal_type: {
            type: "string",
            enum: ["breakfast", "lunch", "dinner", "snack", "dessert"],
            description: "Type of meal to suggest.",
          },
          cuisine: {
            type: "string",
            description: "Preferred cuisine type (e.g., 'Italian', 'Asian', 'Mexican').",
          },
          ingredients: {
            type: "array",
            items: { type: "string" },
            description: "Ingredients to use (what's on hand).",
          },
          save_recipe: {
            type: "boolean",
            description: "Whether to save the generated recipe. Default is false.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_recipe",
      description: "Save a recipe to the family recipe collection.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name of the recipe.",
          },
          description: {
            type: "string",
            description: "Brief description of the recipe.",
          },
          cuisine: {
            type: "string",
            description: "Cuisine type.",
          },
          meal_type: {
            type: "string",
            enum: ["breakfast", "lunch", "dinner", "snack", "dessert"],
            description: "Type of meal.",
          },
          prep_time: {
            type: "number",
            description: "Prep time in minutes.",
          },
          cook_time: {
            type: "number",
            description: "Cook time in minutes.",
          },
          servings: {
            type: "number",
            description: "Number of servings.",
          },
          ingredients: {
            type: "array",
            items: { type: "string" },
            description: "List of ingredients with quantities.",
          },
          instructions: {
            type: "array",
            items: { type: "string" },
            description: "Step-by-step cooking instructions.",
          },
        },
        required: ["name", "ingredients", "instructions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_recipe_to_grocery",
      description: "Add recipe ingredients to the grocery list.",
      parameters: {
        type: "object",
        properties: {
          recipe_id: {
            type: "string",
            description: "ID of a saved recipe to add ingredients from.",
          },
          ingredients: {
            type: "array",
            items: { type: "string" },
            description: "List of ingredients to add directly (if not using recipe_id).",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_favorite_recipes",
      description: "Get the family's favorite recipes.",
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
      name: "search_recipes",
      description: "Search saved recipes by name, ingredients, or cuisine.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query (matches recipe name, description, cuisine, or ingredients).",
          },
        },
        required: ["query"],
      },
    },
  },
];

export const foodToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  record_food_preference: (p) => p.isAdmin || p.canAccessGrocery,
  record_dietary_restriction: (p) => p.isAdmin || p.canAccessGrocery,
  record_meal: (p) => p.isAdmin || p.canAccessGrocery,
  get_food_preferences: (p) => p.isAdmin || p.canAccessGrocery,
  get_dietary_restrictions: (p) => p.isAdmin || p.canAccessGrocery,
  get_meal_history: (p) => p.isAdmin || p.canAccessGrocery,
  suggest_recipe: (p) => p.isAdmin || p.canAccessGrocery,
  save_recipe: (p) => p.isAdmin || p.canAccessGrocery,
  add_recipe_to_grocery: (p) => p.isAdmin || p.canAccessGrocery,
  get_favorite_recipes: (p) => p.isAdmin || p.canAccessGrocery,
  search_recipes: (p) => p.isAdmin || p.canAccessGrocery,
};

function getOrCreateMemberId(memberName: string): string {
  let member = getFamilyMemberByName(memberName);
  if (!member) {
    member = createFamilyMember(memberName);
    console.log(`[FOOD] Created new family member: ${memberName}`);
  }
  return member.id;
}

export async function executeFoodTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  switch (toolName) {
    case "record_food_preference": {
      const { member_id, item_type, item_name, preference, notes } = args as {
        member_id: string;
        item_type: FoodItemType;
        item_name: string;
        preference: FoodPreferenceLevel;
        notes?: string;
      };

      try {
        const memberId = getOrCreateMemberId(member_id);
        const pref = upsertFoodPreference({
          memberId,
          itemType: item_type,
          itemName: item_name,
          preference,
          notes: notes || null,
        });

        console.log(`[FOOD] Recorded preference for ${member_id}: ${preference} ${item_name}`);

        return JSON.stringify({
          success: true,
          message: `Recorded that ${member_id} ${preference}s ${item_name}`,
          preference: {
            id: pref.id,
            memberName: member_id,
            itemType: pref.itemType,
            itemName: pref.itemName,
            preference: pref.preference,
          },
        });
      } catch (error) {
        console.error("[FOOD] Error recording preference:", error);
        return JSON.stringify({ success: false, error: "Failed to record food preference" });
      }
    }

    case "record_dietary_restriction": {
      const { member_id, restriction_type, restriction_name, severity, notes } = args as {
        member_id: string;
        restriction_type: DietaryRestrictionType;
        restriction_name: string;
        severity?: DietaryRestrictionSeverity;
        notes?: string;
      };

      try {
        const memberId = getOrCreateMemberId(member_id);
        const restriction = createDietaryRestriction({
          memberId,
          restrictionType: restriction_type,
          restrictionName: restriction_name,
          severity: severity || "strict",
          notes: notes || null,
        });

        console.log(`[FOOD] Recorded restriction for ${member_id}: ${restriction_type} - ${restriction_name}`);

        return JSON.stringify({
          success: true,
          message: `Recorded ${restriction_type} restriction: ${restriction_name} for ${member_id}`,
          restriction: {
            id: restriction.id,
            memberName: member_id,
            type: restriction.restrictionType,
            name: restriction.restrictionName,
            severity: restriction.severity,
          },
        });
      } catch (error) {
        console.error("[FOOD] Error recording restriction:", error);
        return JSON.stringify({ success: false, error: "Failed to record dietary restriction" });
      }
    }

    case "record_meal": {
      const { name, meal_type, cuisine, rating, notes } = args as {
        name: string;
        meal_type: MealType;
        cuisine?: string;
        rating?: number;
        notes?: string;
      };

      try {
        const meal = createMealHistoryEntry({
          name,
          mealType: meal_type,
          cuisine: cuisine || null,
          rating: rating || null,
          notes: notes || null,
          cookedAt: new Date().toISOString(),
        });

        console.log(`[FOOD] Recorded meal: ${name} (${meal_type})`);

        return JSON.stringify({
          success: true,
          message: `Logged ${meal_type}: ${name}${rating ? ` - ${rating} stars` : ""}`,
          meal: {
            id: meal.id,
            name: meal.name,
            mealType: meal.mealType,
            cuisine: meal.cuisine,
            rating: meal.rating,
          },
        });
      } catch (error) {
        console.error("[FOOD] Error recording meal:", error);
        return JSON.stringify({ success: false, error: "Failed to record meal" });
      }
    }

    case "get_food_preferences": {
      const { member_id } = args as { member_id?: string };

      try {
        let memberId: string | undefined;
        if (member_id) {
          const member = getFamilyMemberByName(member_id);
          memberId = member?.id;
        }

        const preferences = getFoodPreferences(memberId);
        const liked = getLikedIngredients(memberId);
        const disliked = getDislikedIngredients(memberId);

        const groupedByMember: Record<string, {
          loves: string[];
          likes: string[];
          dislikes: string[];
          allergic: string[];
        }> = {};

        for (const pref of preferences) {
          const memberName = member_id || pref.memberId;
          if (!groupedByMember[memberName]) {
            groupedByMember[memberName] = { loves: [], likes: [], dislikes: [], allergic: [] };
          }
          const display = `${pref.itemName} (${pref.itemType})`;
          if (pref.preference === "love") groupedByMember[memberName].loves.push(display);
          else if (pref.preference === "like") groupedByMember[memberName].likes.push(display);
          else if (pref.preference === "dislike") groupedByMember[memberName].dislikes.push(display);
          else if (pref.preference === "allergic") groupedByMember[memberName].allergic.push(display);
        }

        console.log(`[FOOD] Retrieved preferences${member_id ? ` for ${member_id}` : ""}`);

        return JSON.stringify({
          preferences_by_member: groupedByMember,
          summary: {
            liked_ingredients: liked.map(l => l.itemName),
            disliked_ingredients: disliked.map(d => d.itemName),
            total_preferences: preferences.length,
          },
        });
      } catch (error) {
        console.error("[FOOD] Error getting preferences:", error);
        return JSON.stringify({ error: "Failed to get food preferences" });
      }
    }

    case "get_dietary_restrictions": {
      const { member_id } = args as { member_id?: string };

      try {
        let memberId: string | undefined;
        if (member_id) {
          const member = getFamilyMemberByName(member_id);
          memberId = member?.id;
        }

        const restrictions = getDietaryRestrictions(memberId);

        const groupedByMember: Record<string, Array<{
          type: string;
          name: string;
          severity: string;
          notes: string | null;
        }>> = {};

        for (const r of restrictions) {
          const memberName = member_id || r.memberId;
          if (!groupedByMember[memberName]) {
            groupedByMember[memberName] = [];
          }
          groupedByMember[memberName].push({
            type: r.restrictionType,
            name: r.restrictionName,
            severity: r.severity || "strict",
            notes: r.notes,
          });
        }

        console.log(`[FOOD] Retrieved dietary restrictions${member_id ? ` for ${member_id}` : ""}`);

        return JSON.stringify({
          restrictions_by_member: groupedByMember,
          total_restrictions: restrictions.length,
          all_restrictions: restrictions.map(r => `${r.restrictionName} (${r.restrictionType})`),
        });
      } catch (error) {
        console.error("[FOOD] Error getting restrictions:", error);
        return JSON.stringify({ error: "Failed to get dietary restrictions" });
      }
    }

    case "get_meal_history": {
      const { limit } = args as { limit?: number };

      try {
        const meals = getMealHistory(limit || 10);

        console.log(`[FOOD] Retrieved ${meals.length} recent meals`);

        return JSON.stringify({
          recent_meals: meals.map(m => ({
            name: m.name,
            mealType: m.mealType,
            cuisine: m.cuisine,
            rating: m.rating,
            cookedAt: m.cookedAt,
            notes: m.notes,
          })),
          total_count: meals.length,
        });
      } catch (error) {
        console.error("[FOOD] Error getting meal history:", error);
        return JSON.stringify({ error: "Failed to get meal history" });
      }
    }

    case "suggest_recipe": {
      const { meal_type, cuisine, ingredients, save_recipe } = args as {
        meal_type?: RecipeMealType;
        cuisine?: string;
        ingredients?: string[];
        save_recipe?: boolean;
      };

      try {
        const allPreferences = getFoodPreferences();
        const allRestrictions = getDietaryRestrictions();
        const recentMeals = getMealHistory(7);
        const familyMembers = getActiveFamilyMembers();

        const likedIngredients = allPreferences
          .filter(p => p.preference === "love" || p.preference === "like")
          .map(p => p.itemName);
        const dislikedIngredients = allPreferences
          .filter(p => p.preference === "dislike" || p.preference === "allergic")
          .map(p => p.itemName);
        const allergies = allRestrictions
          .filter(r => r.restrictionType === "allergy")
          .map(r => r.restrictionName);
        const dietaryPrefs = allRestrictions
          .filter(r => r.restrictionType !== "allergy")
          .map(r => r.restrictionName);

        const prompt = `Generate a recipe for the family with these considerations:

Family members: ${familyMembers.map(m => m.name).join(", ") || "Not specified"}

${meal_type ? `Meal type: ${meal_type}` : ""}
${cuisine ? `Preferred cuisine: ${cuisine}` : ""}
${ingredients && ingredients.length > 0 ? `Available ingredients to use: ${ingredients.join(", ")}` : ""}

MUST AVOID (allergies): ${allergies.join(", ") || "None"}
Dietary preferences: ${dietaryPrefs.join(", ") || "None"}
Disliked ingredients: ${dislikedIngredients.join(", ") || "None"}

Liked ingredients to incorporate: ${likedIngredients.join(", ") || "None specified"}

Recent meals (avoid repeating): ${recentMeals.map(m => m.name).join(", ") || "None"}

Please provide a recipe in this JSON format:
{
  "name": "Recipe Name",
  "description": "Brief description",
  "cuisine": "Cuisine type",
  "mealType": "${meal_type || "dinner"}",
  "prepTime": 15,
  "cookTime": 30,
  "servings": 4,
  "ingredients": ["1 cup flour", "2 eggs", ...],
  "instructions": ["Step 1...", "Step 2...", ...]
}`;

        const client = getOpenAIClient();
        const response = await client.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are a helpful cooking assistant. Generate family-friendly recipes that respect dietary restrictions and preferences. Always respond with valid JSON.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
        });

        const content = response.choices[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          return JSON.stringify({ success: false, error: "Failed to generate recipe" });
        }

        const recipe = JSON.parse(jsonMatch[0]);
        console.log(`[FOOD] Generated recipe: ${recipe.name}`);

        let savedRecipeId: string | undefined;
        if (save_recipe) {
          const saved = createRecipe({
            name: recipe.name,
            description: recipe.description,
            cuisine: recipe.cuisine,
            mealType: recipe.mealType,
            prepTime: recipe.prepTime,
            cookTime: recipe.cookTime,
            servings: recipe.servings,
            ingredients: JSON.stringify(recipe.ingredients),
            instructions: JSON.stringify(recipe.instructions),
            source: "AI generated",
          });
          savedRecipeId = saved.id;
          console.log(`[FOOD] Saved recipe with ID: ${savedRecipeId}`);
        }

        return JSON.stringify({
          success: true,
          recipe: {
            ...recipe,
            saved: !!savedRecipeId,
            id: savedRecipeId,
          },
        });
      } catch (error) {
        console.error("[FOOD] Error suggesting recipe:", error);
        return JSON.stringify({ success: false, error: "Failed to generate recipe suggestion" });
      }
    }

    case "save_recipe": {
      const {
        name,
        description,
        cuisine,
        meal_type,
        prep_time,
        cook_time,
        servings,
        ingredients,
        instructions,
      } = args as {
        name: string;
        description?: string;
        cuisine?: string;
        meal_type?: RecipeMealType;
        prep_time?: number;
        cook_time?: number;
        servings?: number;
        ingredients: string[];
        instructions: string[];
      };

      try {
        const recipe = createRecipe({
          name,
          description: description || null,
          cuisine: cuisine || null,
          mealType: meal_type || null,
          prepTime: prep_time || null,
          cookTime: cook_time || null,
          servings: servings || null,
          ingredients: JSON.stringify(ingredients),
          instructions: JSON.stringify(instructions),
        });

        console.log(`[FOOD] Saved recipe: ${name} (ID: ${recipe.id})`);

        return JSON.stringify({
          success: true,
          message: `Saved recipe: ${name}`,
          recipe: {
            id: recipe.id,
            name: recipe.name,
            cuisine: recipe.cuisine,
            mealType: recipe.mealType,
          },
        });
      } catch (error) {
        console.error("[FOOD] Error saving recipe:", error);
        return JSON.stringify({ success: false, error: "Failed to save recipe" });
      }
    }

    case "add_recipe_to_grocery": {
      const { recipe_id, ingredients } = args as {
        recipe_id?: string;
        ingredients?: string[];
      };

      try {
        let itemsToAdd: string[] = [];

        if (recipe_id) {
          const recipe = getRecipeById(recipe_id);
          if (!recipe) {
            return JSON.stringify({ success: false, error: "Recipe not found" });
          }
          try {
            itemsToAdd = JSON.parse(recipe.ingredients);
          } catch {
            itemsToAdd = [recipe.ingredients];
          }
        } else if (ingredients && ingredients.length > 0) {
          itemsToAdd = ingredients;
        } else {
          return JSON.stringify({
            success: false,
            error: "Please provide either a recipe_id or a list of ingredients",
          });
        }

        const addedItems: string[] = [];
        for (const item of itemsToAdd) {
          const cleanItem = item.replace(/^[\d\s\/\-\.]+/, "").trim();
          if (cleanItem) {
            createGroceryItem({
              name: cleanItem,
              quantity: "1",
              category: "Other",
              addedBy: "ZEKE",
            });
            addedItems.push(cleanItem);
          }
        }

        console.log(`[FOOD] Added ${addedItems.length} items to grocery list`);

        return JSON.stringify({
          success: true,
          message: `Added ${addedItems.length} items to the grocery list`,
          items_added: addedItems,
        });
      } catch (error) {
        console.error("[FOOD] Error adding to grocery:", error);
        return JSON.stringify({ success: false, error: "Failed to add items to grocery list" });
      }
    }

    case "get_favorite_recipes": {
      try {
        const favorites = getFavoriteRecipes();

        console.log(`[FOOD] Retrieved ${favorites.length} favorite recipes`);

        return JSON.stringify({
          favorite_recipes: favorites.map(r => ({
            id: r.id,
            name: r.name,
            description: r.description,
            cuisine: r.cuisine,
            mealType: r.mealType,
            rating: r.familyRating,
            timesCooked: r.timesCooked,
          })),
          total_count: favorites.length,
        });
      } catch (error) {
        console.error("[FOOD] Error getting favorites:", error);
        return JSON.stringify({ error: "Failed to get favorite recipes" });
      }
    }

    case "search_recipes": {
      const { query } = args as { query: string };

      try {
        const results = searchRecipes(query);

        console.log(`[FOOD] Found ${results.length} recipes matching "${query}"`);

        return JSON.stringify({
          query,
          results: results.map(r => ({
            id: r.id,
            name: r.name,
            description: r.description,
            cuisine: r.cuisine,
            mealType: r.mealType,
            isFavorite: r.isFavorite,
            rating: r.familyRating,
          })),
          total_count: results.length,
        });
      } catch (error) {
        console.error("[FOOD] Error searching recipes:", error);
        return JSON.stringify({ error: "Failed to search recipes" });
      }
    }

    default:
      return null;
  }
}

export const foodToolNames = [
  "record_food_preference",
  "record_dietary_restriction",
  "record_meal",
  "get_food_preferences",
  "get_dietary_restrictions",
  "get_meal_history",
  "suggest_recipe",
  "save_recipe",
  "add_recipe_to_grocery",
  "get_favorite_recipes",
  "search_recipes",
];
