import type OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import type { ToolPermissions } from "../tools";
import {
  createContact,
  findContactsByName,
  findSimilarContact,
  getContact,
  getAllContacts,
  updateContact,
  incrementContactInteraction,
  getMemoriesForContact,
  linkMemoryToContact,
  createMemoryWithContact,
  getRecentlyInteractedContacts,
  getMostInteractedContacts,
  getAutoCreatedContacts,
  searchContacts,
} from "../db";
import type { Contact } from "@shared/schema";
import {
  extractPeopleFromRecentLifelogs,
  searchPersonInLifelogs,
  type ExtractedPerson,
} from "../omi";

export const peopleToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "auto_create_person",
      description: "Automatically create a new person/contact entry when you encounter someone new in lifelogs or conversations. Use this when Nate mentions or interacts with someone who isn't already in the contacts. ZEKE has full autonomous permission to create contacts - do not ask for confirmation.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The person's name as mentioned (e.g., 'Bob', 'Dr. Smith', 'Bob Johnson')",
          },
          relationship: {
            type: "string",
            description: "How they relate to Nate (e.g., 'coworker', 'friend', 'doctor', 'neighbor', 'met at coffee shop')",
          },
          occupation: {
            type: "string",
            description: "Their job or profession if known",
          },
          organization: {
            type: "string",
            description: "Their company, organization, or workplace if known",
          },
          context: {
            type: "string",
            description: "Where/how they were encountered (e.g., 'Mentioned in Tuesday meeting', 'From lifelog conversation about project')",
          },
          notes: {
            type: "string",
            description: "Any other relevant information about this person",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_person",
      description: "Find a person/contact by name. Use this before creating a new person to check if they already exist. Returns matching contacts sorted by interaction frequency.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name to search for (partial matches work)",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_person_info",
      description: "Update information about a person/contact. Use this when you learn new information about someone (their job, birthday, organization, etc.).",
      parameters: {
        type: "object",
        properties: {
          contact_id: {
            type: "string",
            description: "The ID of the contact to update",
          },
          name: {
            type: "string",
            description: "Updated name if corrected",
          },
          relationship: {
            type: "string",
            description: "Their relationship to Nate",
          },
          occupation: {
            type: "string",
            description: "Their job or profession",
          },
          organization: {
            type: "string",
            description: "Their company or organization",
          },
          birthday: {
            type: "string",
            description: "Their birthday (any format - will be stored as text)",
          },
          email: {
            type: "string",
            description: "Their email address",
          },
          notes: {
            type: "string",
            description: "Additional notes about them (will be appended to existing notes)",
          },
        },
        required: ["contact_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_person_interaction",
      description: "Record that Nate had an interaction with a person. Call this whenever you detect a conversation or meeting with someone in lifelogs or when Nate mentions talking to someone.",
      parameters: {
        type: "object",
        properties: {
          contact_id: {
            type: "string",
            description: "The ID of the contact",
          },
        },
        required: ["contact_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "link_memory_to_person",
      description: "Link a memory to a specific person. Use this when creating memories about what someone said, their preferences, or any information related to them.",
      parameters: {
        type: "object",
        properties: {
          memory_id: {
            type: "string",
            description: "The ID of the memory note to link",
          },
          contact_id: {
            type: "string",
            description: "The ID of the person/contact to link to",
          },
        },
        required: ["memory_id", "contact_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_memory_about_person",
      description: "Create a new memory linked to a specific person. Use this to remember things about people - what they said, their preferences, commitments they made, topics they discussed.",
      parameters: {
        type: "object",
        properties: {
          contact_id: {
            type: "string",
            description: "The ID of the person this memory is about",
          },
          type: {
            type: "string",
            enum: ["fact", "preference", "note", "summary"],
            description: "Type of memory: 'fact' for concrete information, 'preference' for likes/dislikes, 'note' for observations, 'summary' for conversation summaries",
          },
          content: {
            type: "string",
            description: "The memory content (e.g., 'Bob mentioned he's allergic to shellfish', 'Sarah prefers morning meetings')",
          },
          context: {
            type: "string",
            description: "Context of where this was learned (e.g., 'From Tuesday's team meeting')",
          },
          source_type: {
            type: "string",
            enum: ["conversation", "lifelog", "manual", "observation"],
            description: "Where this information came from",
          },
          source_id: {
            type: "string",
            description: "ID of the source (lifelog ID, conversation ID, etc.)",
          },
        },
        required: ["contact_id", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_person_memories",
      description: "Get all memories linked to a specific person. Use this to recall what ZEKE knows about someone before a meeting or when Nate asks about them.",
      parameters: {
        type: "object",
        properties: {
          contact_id: {
            type: "string",
            description: "The ID of the person to get memories for",
          },
        },
        required: ["contact_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_people",
      description: "Get people that Nate has recently interacted with. Useful for context about who Nate has been talking to.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of people to return (default 10)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_frequent_people",
      description: "Get people that Nate interacts with most frequently. Useful for identifying key relationships.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of people to return (default 10)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_all_people",
      description: "List all known people/contacts. Use sparingly - prefer find_person for specific lookups.",
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
      name: "search_people",
      description: "Search people by any field - name, relationship, occupation, organization, or notes.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query (matches against name, relationship, occupation, organization, notes)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "extract_people_from_lifelogs",
      description: "Scan recent lifelogs from the Omi pendant and extract all people who were in conversations with Nate. Use this to discover new people to track. ZEKE should use this proactively to find and auto-create contacts for people Nate interacts with.",
      parameters: {
        type: "object",
        properties: {
          hours: {
            type: "number",
            description: "How many hours back to scan (default 24)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_person_history",
      description: "Search for all mentions and conversations involving a specific person in Nate's lifelogs. Use this to build context about a person before creating memories or when Nate asks about interactions with someone.",
      parameters: {
        type: "object",
        properties: {
          person_name: {
            type: "string",
            description: "Name of the person to search for",
          },
          limit: {
            type: "number",
            description: "Maximum number of lifelogs to search (default 10)",
          },
        },
        required: ["person_name"],
      },
    },
  },
];

export const peopleToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  auto_create_person: (p) => p.canAccessPersonalInfo,
  find_person: (p) => p.canAccessPersonalInfo,
  update_person_info: (p) => p.canAccessPersonalInfo,
  record_person_interaction: (p) => p.canAccessPersonalInfo,
  link_memory_to_person: (p) => p.canAccessPersonalInfo,
  create_memory_about_person: (p) => p.canAccessPersonalInfo,
  get_person_memories: (p) => p.canAccessPersonalInfo,
  get_recent_people: (p) => p.canAccessPersonalInfo,
  get_frequent_people: (p) => p.canAccessPersonalInfo,
  list_all_people: (p) => p.canAccessPersonalInfo,
  search_people: (p) => p.canAccessPersonalInfo,
  extract_people_from_lifelogs: (p) => p.canAccessPersonalInfo,
  search_person_history: (p) => p.canAccessPersonalInfo,
};

export const peopleToolNames = Object.keys(peopleToolPermissions);

function formatContact(contact: Contact): object {
  return {
    id: contact.id,
    name: contact.name,
    phoneNumber: contact.phoneNumber || null,
    relationship: contact.relationship || null,
    occupation: contact.occupation || null,
    organization: contact.organization || null,
    birthday: contact.birthday || null,
    email: contact.email || null,
    notes: contact.notes || null,
    lastInteractionAt: contact.lastInteractionAt || null,
    interactionCount: contact.interactionCount || 0,
    isAutoCreated: contact.isAutoCreated || false,
  };
}

export async function executePeopleTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  switch (toolName) {
    case "auto_create_person": {
      const { name, relationship, occupation, organization, context, notes } = args as {
        name: string;
        relationship?: string;
        occupation?: string;
        organization?: string;
        context?: string;
        notes?: string;
      };
      
      try {
        const existing = findSimilarContact(name);
        if (existing) {
          incrementContactInteraction(existing.id);
          return JSON.stringify({
            success: true,
            message: `Found existing contact "${existing.name}" - updated last interaction`,
            contact: formatContact(existing),
            was_existing: true,
          });
        }
        
        const contextNote = context ? `Context: ${context}` : "";
        const combinedNotes = [notes, contextNote].filter(Boolean).join("\n");
        
        const uniquePhonePlaceholder = `auto-${uuidv4()}`;
        
        const contact = createContact({
          name,
          phoneNumber: uniquePhonePlaceholder,
          relationship: relationship || "",
          occupation: occupation || null,
          organization: organization || null,
          notes: combinedNotes,
          accessLevel: "unknown",
          isAutoCreated: true,
        });
        
        console.log(`[People] Auto-created contact: ${name} (${contact.id})`);
        
        return JSON.stringify({
          success: true,
          message: `Created new person "${name}" in contacts`,
          contact: formatContact(contact),
          was_existing: false,
        });
      } catch (error: any) {
        console.error("Failed to auto-create person:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to create person",
        });
      }
    }
    
    case "find_person": {
      const { name } = args as { name: string };
      
      try {
        const contacts = findContactsByName(name);
        
        if (contacts.length === 0) {
          return JSON.stringify({
            success: true,
            message: `No people found matching "${name}"`,
            results: [],
          });
        }
        
        return JSON.stringify({
          success: true,
          message: `Found ${contacts.length} person(s) matching "${name}"`,
          results: contacts.map(formatContact),
        });
      } catch (error: any) {
        console.error("Failed to find person:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to find person",
        });
      }
    }
    
    case "update_person_info": {
      const { contact_id, name, relationship, occupation, organization, birthday, email, notes } = args as {
        contact_id: string;
        name?: string;
        relationship?: string;
        occupation?: string;
        organization?: string;
        birthday?: string;
        email?: string;
        notes?: string;
      };
      
      try {
        const existing = getContact(contact_id);
        if (!existing) {
          return JSON.stringify({
            success: false,
            error: `No person found with ID "${contact_id}"`,
          });
        }
        
        const updatedNotes = notes 
          ? (existing.notes ? `${existing.notes}\n${notes}` : notes)
          : undefined;
        
        const updated = updateContact(contact_id, {
          name,
          relationship,
          occupation,
          organization,
          birthday,
          email,
          notes: updatedNotes,
        });
        
        console.log(`[People] Updated contact: ${updated?.name} (${contact_id})`);
        
        return JSON.stringify({
          success: true,
          message: `Updated information for "${updated?.name}"`,
          contact: updated ? formatContact(updated) : null,
        });
      } catch (error: any) {
        console.error("Failed to update person:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to update person",
        });
      }
    }
    
    case "record_person_interaction": {
      const { contact_id } = args as { contact_id: string };
      
      try {
        const contact = incrementContactInteraction(contact_id);
        
        if (!contact) {
          return JSON.stringify({
            success: false,
            error: `No person found with ID "${contact_id}"`,
          });
        }
        
        return JSON.stringify({
          success: true,
          message: `Recorded interaction with "${contact.name}" (${contact.interactionCount} total)`,
          contact: formatContact(contact),
        });
      } catch (error: any) {
        console.error("Failed to record interaction:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to record interaction",
        });
      }
    }
    
    case "link_memory_to_person": {
      const { memory_id, contact_id } = args as {
        memory_id: string;
        contact_id: string;
      };
      
      try {
        const contact = getContact(contact_id);
        if (!contact) {
          return JSON.stringify({
            success: false,
            error: `No person found with ID "${contact_id}"`,
          });
        }
        
        const memory = linkMemoryToContact(memory_id, contact_id);
        
        if (!memory) {
          return JSON.stringify({
            success: false,
            error: `No memory found with ID "${memory_id}"`,
          });
        }
        
        return JSON.stringify({
          success: true,
          message: `Linked memory to "${contact.name}"`,
          memory: {
            id: memory.id,
            type: memory.type,
            content: memory.content,
            contactId: memory.contactId,
          },
        });
      } catch (error: any) {
        console.error("Failed to link memory:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to link memory to person",
        });
      }
    }
    
    case "create_memory_about_person": {
      const { contact_id, type, content, context, source_type, source_id } = args as {
        contact_id: string;
        type?: "fact" | "preference" | "note" | "summary";
        content: string;
        context?: string;
        source_type?: "conversation" | "lifelog" | "manual" | "observation";
        source_id?: string;
      };
      
      try {
        const contact = getContact(contact_id);
        if (!contact) {
          return JSON.stringify({
            success: false,
            error: `No person found with ID "${contact_id}"`,
          });
        }
        
        const memory = createMemoryWithContact(
          type || "note",
          content,
          context || "",
          contact_id,
          source_type,
          source_id
        );
        
        console.log(`[People] Created memory about ${contact.name}: ${content.substring(0, 50)}...`);
        
        return JSON.stringify({
          success: true,
          message: `Created memory about "${contact.name}"`,
          memory: {
            id: memory.id,
            type: memory.type,
            content: memory.content,
            context: memory.context,
            contactId: memory.contactId,
            sourceType: memory.sourceType,
          },
        });
      } catch (error: any) {
        console.error("Failed to create memory:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to create memory about person",
        });
      }
    }
    
    case "get_person_memories": {
      const { contact_id } = args as { contact_id: string };
      
      try {
        const contact = getContact(contact_id);
        if (!contact) {
          return JSON.stringify({
            success: false,
            error: `No person found with ID "${contact_id}"`,
          });
        }
        
        const memories = getMemoriesForContact(contact_id);
        
        return JSON.stringify({
          success: true,
          person: contact.name,
          message: `Found ${memories.length} memory(s) about "${contact.name}"`,
          memories: memories.map(m => ({
            id: m.id,
            type: m.type,
            content: m.content,
            context: m.context,
            sourceType: m.sourceType,
            createdAt: m.createdAt,
          })),
        });
      } catch (error: any) {
        console.error("Failed to get memories:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to get memories for person",
        });
      }
    }
    
    case "get_recent_people": {
      const { limit } = args as { limit?: number };
      
      try {
        const contacts = getRecentlyInteractedContacts(limit || 10);
        
        return JSON.stringify({
          success: true,
          message: `Found ${contacts.length} recently interacted people`,
          people: contacts.map(formatContact),
        });
      } catch (error: any) {
        console.error("Failed to get recent people:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to get recent people",
        });
      }
    }
    
    case "get_frequent_people": {
      const { limit } = args as { limit?: number };
      
      try {
        const contacts = getMostInteractedContacts(limit || 10);
        
        return JSON.stringify({
          success: true,
          message: `Found ${contacts.length} frequently interacted people`,
          people: contacts.map(formatContact),
        });
      } catch (error: any) {
        console.error("Failed to get frequent people:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to get frequent people",
        });
      }
    }
    
    case "list_all_people": {
      try {
        const contacts = getAllContacts();
        
        return JSON.stringify({
          success: true,
          message: `Found ${contacts.length} total people`,
          people: contacts.map(formatContact),
        });
      } catch (error: any) {
        console.error("Failed to list people:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to list people",
        });
      }
    }
    
    case "search_people": {
      const { query } = args as { query: string };
      
      try {
        const contacts = searchContacts(query);
        
        return JSON.stringify({
          success: true,
          message: `Found ${contacts.length} people matching "${query}"`,
          results: contacts.map(formatContact),
        });
      } catch (error: any) {
        console.error("Failed to search people:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to search people",
        });
      }
    }
    
    case "extract_people_from_lifelogs": {
      const { hours } = args as { hours?: number };
      
      try {
        const extractedPeople = await extractPeopleFromRecentLifelogs(hours || 24);
        
        if (extractedPeople.length === 0) {
          return JSON.stringify({
            success: true,
            message: `No new people found in lifelogs from the last ${hours || 24} hours`,
            people: [],
          });
        }
        
        const results: {
          person: ExtractedPerson;
          existingContact: object | null;
          isNew: boolean;
        }[] = [];
        
        for (const person of extractedPeople) {
          const existing = findSimilarContact(person.name);
          results.push({
            person,
            existingContact: existing ? formatContact(existing) : null,
            isNew: !existing,
          });
        }
        
        const newPeople = results.filter(r => r.isNew);
        const existingPeople = results.filter(r => !r.isNew);
        
        return JSON.stringify({
          success: true,
          message: `Found ${extractedPeople.length} people in lifelogs (${newPeople.length} new, ${existingPeople.length} existing)`,
          newPeople: newPeople.map(r => r.person),
          existingPeople: existingPeople.map(r => ({
            ...r.person,
            matchedContact: r.existingContact,
          })),
          suggestion: newPeople.length > 0 
            ? `Consider using auto_create_person to add these new people: ${newPeople.map(r => r.person.name).join(", ")}` 
            : null,
        });
      } catch (error: any) {
        console.error("Failed to extract people from lifelogs:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to extract people from lifelogs. Make sure Omi API is configured.",
        });
      }
    }
    
    case "search_person_history": {
      const { person_name, limit } = args as { person_name: string; limit?: number };
      
      try {
        const { lifelogs, mentions } = await searchPersonInLifelogs(person_name, limit || 10);
        
        if (lifelogs.length === 0) {
          return JSON.stringify({
            success: true,
            message: `No conversations found involving "${person_name}"`,
            lifelogs: [],
            mentions: [],
          });
        }
        
        return JSON.stringify({
          success: true,
          message: `Found ${lifelogs.length} conversation(s) and ${mentions.length} mention(s) of "${person_name}"`,
          lifelogs: lifelogs.map(l => ({
            id: l.id,
            title: l.title,
            startTime: l.startTime,
            endTime: l.endTime,
            isStarred: l.isStarred,
          })),
          mentions: mentions.slice(0, 10),
        });
      } catch (error: any) {
        console.error("Failed to search person history:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to search person history. Make sure Omi API is configured.",
        });
      }
    }
    
    default:
      return null;
  }
}
