import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import {
  findNearbyPlaces,
  getStarredPlaces,
  getAllSavedPlaces,
  createSavedPlace,
  getAllPlaceLists,
  checkGroceryProximity,
  getLatestLocation,
  getLocationHistory,
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
];

export const locationToolNames = locationToolDefinitions.map(t => t.function.name);

export const locationToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  get_nearby_places: () => true,
  get_starred_places: () => true,
  get_all_saved_places: () => true,
  save_location_as_place: () => true,
  get_place_lists: () => true,
  check_nearby_grocery_stores: () => true,
  get_user_location: () => true,
  get_recent_location_history: () => true,
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

      try {
        const place = createSavedPlace({
          name,
          latitude: latitude.toString(),
          longitude: longitude.toString(),
          address: address || "",
          category: category || "other",
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
          grocery_list_linked: l.groceryListLinked,
          place_count: l.placeIds ? l.placeIds.length : 0,
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
          timestamp: latest.timestamp,
          accuracy_meters: latest.accuracyMeters,
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
          timestamp: h.timestamp,
          source: h.source,
        })),
      });
    }

    default:
      return null;
  }
}
