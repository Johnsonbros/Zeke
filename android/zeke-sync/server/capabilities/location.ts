import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import type { PlaceCategory } from "@shared/schema";
import {
  findNearbyPlaces,
  getStarredPlaces,
  getAllSavedPlaces,
  createSavedPlace,
  getAllPlaceLists,
  checkGroceryProximity,
  getLatestLocation,
  getLocationHistory,
  updateSavedPlace,
  deleteSavedPlace,
  getSavedPlace,
  createPlaceList,
  addPlaceToList,
  removePlaceFromList,
  getPlacesInList,
  linkTaskToPlace,
  linkReminderToPlace,
  linkMemoryToPlace,
  unlinkTaskFromPlace,
  unlinkReminderFromPlace,
  unlinkMemoryFromPlace,
  getPlaceWithLinkedItems,
  getTasksByPlace,
  getRemindersByPlace,
  getMemoriesByPlace,
} from "../db";

export const locationToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_nearby_places",
      description: "Find saved places near a specific location. Useful for checking what places the user has saved near their current location or a specified point.",
      parameters: {
        type: "object",
        properties: {
          latitude: {
            type: "number",
            description: "Latitude of the location to search near. If not provided, uses user's latest known location.",
          },
          longitude: {
            type: "number",
            description: "Longitude of the location to search near. If not provided, uses user's latest known location.",
          },
          radius_meters: {
            type: "number",
            description: "Search radius in meters. Default is 500 meters.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_starred_places",
      description: "Get the user's starred (favorite) places. These are important locations the user has marked as favorites.",
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
      name: "get_all_saved_places",
      description: "Get all saved places. Use this to see everywhere the user has saved.",
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
      name: "save_location_as_place",
      description: "Save a location as a new place with a name and optional details. Use this when the user wants to remember a location.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name for the place (e.g., 'Home', 'Work', 'Favorite Coffee Shop')",
          },
          latitude: {
            type: "number",
            description: "Latitude of the place. If not provided, uses user's current location.",
          },
          longitude: {
            type: "number",
            description: "Longitude of the place. If not provided, uses user's current location.",
          },
          address: {
            type: "string",
            description: "Street address of the place (optional)",
          },
          category: {
            type: "string",
            enum: ["home", "work", "grocery", "restaurant", "shopping", "health", "entertainment", "travel", "other"],
            description: "Category of the place. Default is 'other'.",
          },
          notes: {
            type: "string",
            description: "Additional notes about the place (optional)",
          },
          is_starred: {
            type: "boolean",
            description: "Whether to star/favorite this place. Default is false.",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_place_lists",
      description: "Get all place lists (groupings of places like 'All Grocery Stores', 'Restaurants to Try', etc.)",
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
      name: "check_nearby_grocery_stores",
      description: "Check if the user is near any grocery-linked stores. Returns stores with associated grocery lists. Use this when the user asks about nearby grocery options or when providing shopping suggestions.",
      parameters: {
        type: "object",
        properties: {
          latitude: {
            type: "number",
            description: "Latitude to check from. If not provided, uses user's latest known location.",
          },
          longitude: {
            type: "number",
            description: "Longitude to check from. If not provided, uses user's latest known location.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_location",
      description: "Get the user's current or most recent location. Use this to understand where the user is.",
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
      name: "get_recent_location_history",
      description: "Get the user's recent location history. Use this to understand where the user has been.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of location points to return. Default is 10.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_place",
      description: "Update a saved place's details like name, category, notes, starred status, or label. Use this to edit existing places.",
      parameters: {
        type: "object",
        properties: {
          place_id: {
            type: "string",
            description: "The ID of the place to update",
          },
          name: {
            type: "string",
            description: "New name for the place",
          },
          category: {
            type: "string",
            enum: ["home", "work", "grocery", "restaurant", "shopping", "health", "entertainment", "travel", "other"],
            description: "New category for the place",
          },
          notes: {
            type: "string",
            description: "Notes about the place",
          },
          label: {
            type: "string",
            description: "A short label or tag for the place",
          },
          is_starred: {
            type: "boolean",
            description: "Whether to star/favorite this place",
          },
        },
        required: ["place_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_place",
      description: "Delete a saved place. This will also unlink any tasks, reminders, or memories associated with it.",
      parameters: {
        type: "object",
        properties: {
          place_id: {
            type: "string",
            description: "The ID of the place to delete",
          },
        },
        required: ["place_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_place_list",
      description: "Create a new list to group places together (e.g., 'All Grocery Stores', 'Favorite Restaurants', 'Doctors Offices').",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name for the place list",
          },
          description: {
            type: "string",
            description: "Description of what places are in this list",
          },
          linked_to_grocery: {
            type: "boolean",
            description: "Whether proximity to places in this list should trigger grocery reminders",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_place_to_list",
      description: "Add a saved place to a place list.",
      parameters: {
        type: "object",
        properties: {
          list_id: {
            type: "string",
            description: "The ID of the place list",
          },
          place_id: {
            type: "string",
            description: "The ID of the place to add",
          },
        },
        required: ["list_id", "place_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_place_from_list",
      description: "Remove a place from a place list.",
      parameters: {
        type: "object",
        properties: {
          list_id: {
            type: "string",
            description: "The ID of the place list",
          },
          place_id: {
            type: "string",
            description: "The ID of the place to remove",
          },
        },
        required: ["list_id", "place_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "link_task_to_location",
      description: "Link a task to a location. When the user is near this location, ZEKE can remind them about the task.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "The ID of the task to link",
          },
          place_id: {
            type: "string",
            description: "The ID of the place to link it to",
          },
        },
        required: ["task_id", "place_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "link_reminder_to_location",
      description: "Link a reminder to a location. The reminder can be triggered when the user is near this location.",
      parameters: {
        type: "object",
        properties: {
          reminder_id: {
            type: "string",
            description: "The ID of the reminder to link",
          },
          place_id: {
            type: "string",
            description: "The ID of the place to link it to",
          },
        },
        required: ["reminder_id", "place_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "link_memory_to_location",
      description: "Associate a memory with a location. Useful for remembering things that happened at specific places.",
      parameters: {
        type: "object",
        properties: {
          memory_id: {
            type: "string",
            description: "The ID of the memory note to link",
          },
          place_id: {
            type: "string",
            description: "The ID of the place to link it to",
          },
        },
        required: ["memory_id", "place_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_items_at_location",
      description: "Get all tasks, reminders, and memories linked to a specific location.",
      parameters: {
        type: "object",
        properties: {
          place_id: {
            type: "string",
            description: "The ID of the place to get linked items for",
          },
        },
        required: ["place_id"],
      },
    },
  },
];

export const locationToolNames = [
  "get_nearby_places",
  "get_starred_places",
  "get_all_saved_places",
  "save_location_as_place",
  "get_place_lists",
  "check_nearby_grocery_stores",
  "get_user_location",
  "get_recent_location_history",
  "update_place",
  "delete_place",
  "create_place_list",
  "add_place_to_list",
  "remove_place_from_list",
  "link_task_to_location",
  "link_reminder_to_location",
  "link_memory_to_location",
  "get_items_at_location",
];

export const locationToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  get_nearby_places: () => true,
  get_starred_places: () => true,
  get_all_saved_places: () => true,
  save_location_as_place: () => true,
  get_place_lists: () => true,
  check_nearby_grocery_stores: () => true,
  get_user_location: () => true,
  get_recent_location_history: () => true,
  update_place: () => true,
  delete_place: () => true,
  create_place_list: () => true,
  add_place_to_list: () => true,
  remove_place_from_list: () => true,
  link_task_to_location: () => true,
  link_reminder_to_location: () => true,
  link_memory_to_location: () => true,
  get_items_at_location: () => true,
};

export async function executeLocationTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  switch (toolName) {
    case "get_nearby_places": {
      let { latitude, longitude, radius_meters } = args as {
        latitude?: number;
        longitude?: number;
        radius_meters?: number;
      };

      if (latitude === undefined || longitude === undefined) {
        const latest = getLatestLocation();
        if (latest) {
          latitude = parseFloat(latest.latitude);
          longitude = parseFloat(latest.longitude);
        } else {
          return JSON.stringify({
            success: false,
            error: "No location provided and no recent location available. Please enable location tracking.",
          });
        }
      }

      const radius = radius_meters || 500;
      const nearbyPlaces = findNearbyPlaces(latitude, longitude, radius);

      if (nearbyPlaces.length === 0) {
        return JSON.stringify({
          success: true,
          message: `No saved places found within ${radius} meters of the location`,
          places: [],
          search_location: { latitude, longitude },
          radius_meters: radius,
        });
      }

      return JSON.stringify({
        success: true,
        message: `Found ${nearbyPlaces.length} place(s) nearby`,
        places: nearbyPlaces.map(p => ({
          id: p.id,
          name: p.name,
          category: p.category,
          address: p.address,
          notes: p.notes,
          distance_meters: Math.round(p.distance),
          is_starred: p.isStarred,
        })),
        search_location: { latitude, longitude },
        radius_meters: radius,
      });
    }

    case "get_starred_places": {
      const starred = getStarredPlaces();

      if (starred.length === 0) {
        return JSON.stringify({
          success: true,
          message: "No starred places yet",
          places: [],
        });
      }

      return JSON.stringify({
        success: true,
        message: `Found ${starred.length} starred place(s)`,
        places: starred.map(p => ({
          id: p.id,
          name: p.name,
          category: p.category,
          address: p.address,
          notes: p.notes,
          latitude: p.latitude,
          longitude: p.longitude,
        })),
      });
    }

    case "get_all_saved_places": {
      const places = getAllSavedPlaces();

      if (places.length === 0) {
        return JSON.stringify({
          success: true,
          message: "No saved places yet",
          places: [],
        });
      }

      return JSON.stringify({
        success: true,
        message: `Found ${places.length} saved place(s)`,
        places: places.map(p => ({
          id: p.id,
          name: p.name,
          category: p.category,
          address: p.address,
          notes: p.notes,
          is_starred: p.isStarred,
        })),
      });
    }

    case "save_location_as_place": {
      let { name, latitude, longitude, address, category, notes, is_starred } = args as {
        name: string;
        latitude?: number;
        longitude?: number;
        address?: string;
        category?: string;
        notes?: string;
        is_starred?: boolean;
      };

      if (latitude === undefined || longitude === undefined) {
        const latest = getLatestLocation();
        if (latest) {
          latitude = parseFloat(latest.latitude);
          longitude = parseFloat(latest.longitude);
        } else {
          return JSON.stringify({
            success: false,
            error: "No location provided and no recent location available. Please provide coordinates or enable location tracking.",
          });
        }
      }

      const validCategories = ["home", "work", "grocery", "restaurant", "shopping", "entertainment", "travel", "gym", "healthcare", "services", "personal", "other"] as const;
      const safeCategory = (category && validCategories.includes(category as PlaceCategory)) 
        ? category as PlaceCategory 
        : "other";

      try {
        const place = createSavedPlace({
          name,
          latitude: latitude.toString(),
          longitude: longitude.toString(),
          address: address || "",
          category: safeCategory,
          notes: notes || "",
          isStarred: is_starred || false,
          proximityRadiusMeters: 100,
          proximityAlertEnabled: false,
        });

        return JSON.stringify({
          success: true,
          message: `Saved "${name}" as a new place`,
          place: {
            id: place.id,
            name: place.name,
            category: place.category,
            address: place.address,
            latitude: place.latitude,
            longitude: place.longitude,
            is_starred: place.isStarred,
          },
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: "Failed to save place",
        });
      }
    }

    case "get_place_lists": {
      const lists = getAllPlaceLists();

      if (lists.length === 0) {
        return JSON.stringify({
          success: true,
          message: "No place lists created yet",
          lists: [],
        });
      }

      return JSON.stringify({
        success: true,
        message: `Found ${lists.length} place list(s)`,
        lists: lists.map(l => ({
          id: l.id,
          name: l.name,
          description: l.description,
          grocery_list_linked: l.linkedToGrocery,
        })),
      });
    }

    case "check_nearby_grocery_stores": {
      let { latitude, longitude } = args as {
        latitude?: number;
        longitude?: number;
      };

      if (latitude === undefined || longitude === undefined) {
        const latest = getLatestLocation();
        if (latest) {
          latitude = parseFloat(latest.latitude);
          longitude = parseFloat(latest.longitude);
        } else {
          return JSON.stringify({
            success: false,
            error: "No location provided and no recent location available.",
          });
        }
      }

      const nearbyStores = checkGroceryProximity(latitude, longitude);

      if (nearbyStores.length === 0) {
        return JSON.stringify({
          success: true,
          message: "Not currently near any grocery-linked stores",
          nearby_stores: [],
          user_location: { latitude, longitude },
        });
      }

      return JSON.stringify({
        success: true,
        message: `Near ${nearbyStores.length} grocery-linked store(s)! Consider checking the grocery list.`,
        nearby_stores: nearbyStores.map(s => ({
          place_name: s.place.name,
          place_category: s.place.category,
          list_name: s.list.name,
          distance_meters: Math.round(s.distance),
          grocery_list_linked: true,
        })),
        user_location: { latitude, longitude },
      });
    }

    case "get_user_location": {
      const latest = getLatestLocation();

      if (!latest) {
        return JSON.stringify({
          success: false,
          error: "No location data available. Location tracking may be disabled.",
          location: null,
        });
      }

      return JSON.stringify({
        success: true,
        message: "Current location retrieved",
        location: {
          latitude: parseFloat(latest.latitude),
          longitude: parseFloat(latest.longitude),
          timestamp: latest.createdAt,
          accuracy_meters: latest.accuracy ? parseFloat(latest.accuracy) : null,
          source: latest.source,
        },
      });
    }

    case "get_recent_location_history": {
      const { limit } = args as { limit?: number };
      const maxPoints = limit || 10;

      const history = getLocationHistory(maxPoints);

      if (history.length === 0) {
        return JSON.stringify({
          success: true,
          message: "No location history available",
          history: [],
        });
      }

      return JSON.stringify({
        success: true,
        message: `Retrieved ${history.length} location point(s)`,
        history: history.map(h => ({
          latitude: parseFloat(h.latitude),
          longitude: parseFloat(h.longitude),
          timestamp: h.createdAt,
          source: h.source,
        })),
      });
    }

    case "update_place": {
      const { place_id, name, category, notes, label, is_starred } = args as {
        place_id: string;
        name?: string;
        category?: string;
        notes?: string;
        label?: string;
        is_starred?: boolean;
      };

      const updated = updateSavedPlace(place_id, {
        name,
        category: category as PlaceCategory | undefined,
        notes,
        label,
        isStarred: is_starred,
      });

      if (!updated) {
        return JSON.stringify({
          success: false,
          error: "Place not found",
        });
      }

      return JSON.stringify({
        success: true,
        message: `Updated place "${updated.name}"`,
        place: {
          id: updated.id,
          name: updated.name,
          category: updated.category,
          notes: updated.notes,
          label: updated.label,
          is_starred: updated.isStarred,
        },
      });
    }

    case "delete_place": {
      const { place_id } = args as { place_id: string };
      
      const place = getSavedPlace(place_id);
      if (!place) {
        return JSON.stringify({
          success: false,
          error: "Place not found",
        });
      }

      const deleted = deleteSavedPlace(place_id);
      return JSON.stringify({
        success: deleted,
        message: deleted ? `Deleted place "${place.name}"` : "Failed to delete place",
      });
    }

    case "create_place_list": {
      const { name, description, linked_to_grocery } = args as {
        name: string;
        description?: string;
        linked_to_grocery?: boolean;
      };

      const list = createPlaceList({
        name,
        description: description || null,
        linkedToGrocery: linked_to_grocery || false,
      });

      return JSON.stringify({
        success: true,
        message: `Created place list "${name}"`,
        list: {
          id: list.id,
          name: list.name,
          description: list.description,
          linked_to_grocery: list.linkedToGrocery,
        },
      });
    }

    case "add_place_to_list": {
      const { list_id, place_id } = args as { list_id: string; place_id: string };

      try {
        const item = addPlaceToList(list_id, place_id);
        const place = getSavedPlace(place_id);
        return JSON.stringify({
          success: true,
          message: `Added "${place?.name || place_id}" to list`,
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: "Failed to add place to list - check that both IDs exist",
        });
      }
    }

    case "remove_place_from_list": {
      const { list_id, place_id } = args as { list_id: string; place_id: string };

      const removed = removePlaceFromList(list_id, place_id);
      return JSON.stringify({
        success: removed,
        message: removed ? "Removed place from list" : "Place was not in list or list not found",
      });
    }

    case "link_task_to_location": {
      const { task_id, place_id } = args as { task_id: string; place_id: string };

      const task = linkTaskToPlace(task_id, place_id);
      if (!task) {
        return JSON.stringify({
          success: false,
          error: "Task not found",
        });
      }

      const place = getSavedPlace(place_id);
      return JSON.stringify({
        success: true,
        message: `Linked task "${task.title}" to location "${place?.name || place_id}"`,
        task: {
          id: task.id,
          title: task.title,
          place_id: task.placeId,
        },
      });
    }

    case "link_reminder_to_location": {
      const { reminder_id, place_id } = args as { reminder_id: string; place_id: string };

      const reminder = linkReminderToPlace(reminder_id, place_id);
      if (!reminder) {
        return JSON.stringify({
          success: false,
          error: "Reminder not found",
        });
      }

      const place = getSavedPlace(place_id);
      return JSON.stringify({
        success: true,
        message: `Linked reminder to location "${place?.name || place_id}"`,
        reminder: {
          id: reminder.id,
          message: reminder.message,
          place_id: reminder.placeId,
        },
      });
    }

    case "link_memory_to_location": {
      const { memory_id, place_id } = args as { memory_id: string; place_id: string };

      const memory = linkMemoryToPlace(memory_id, place_id);
      if (!memory) {
        return JSON.stringify({
          success: false,
          error: "Memory not found",
        });
      }

      const place = getSavedPlace(place_id);
      return JSON.stringify({
        success: true,
        message: `Linked memory to location "${place?.name || place_id}"`,
        memory: {
          id: memory.id,
          type: memory.type,
          content: memory.content.substring(0, 100) + (memory.content.length > 100 ? "..." : ""),
          place_id: memory.placeId,
        },
      });
    }

    case "get_items_at_location": {
      const { place_id } = args as { place_id: string };

      const result = getPlaceWithLinkedItems(place_id);
      if (!result) {
        return JSON.stringify({
          success: false,
          error: "Place not found",
        });
      }

      return JSON.stringify({
        success: true,
        place: {
          id: result.place.id,
          name: result.place.name,
          category: result.place.category,
        },
        tasks: result.tasks.map(t => ({
          id: t.id,
          title: t.title,
          completed: t.completed,
          priority: t.priority,
        })),
        reminders: result.reminders.map(r => ({
          id: r.id,
          message: r.message,
          scheduledFor: r.scheduledFor,
          completed: r.completed,
        })),
        memories: result.memories.map(m => ({
          id: m.id,
          type: m.type,
          content: m.content.substring(0, 100) + (m.content.length > 100 ? "..." : ""),
        })),
        lists: result.lists.map(l => ({
          id: l.id,
          name: l.name,
        })),
        summary: `Found ${result.tasks.length} tasks, ${result.reminders.length} reminders, ${result.memories.length} memories at "${result.place.name}"`,
      });
    }

    default:
      return null;
  }
}
