import {
  createGroceryItem,
  getAllGroceryItems,
  getAllTasks,
  createMemoryNote,
  createReminder,
  getAllCustomLists,
  getCustomListByName,
  getCustomListWithItems,
  createCustomListItem,
  toggleCustomListItemChecked,
  createCustomList,
  getCustomListItems,
} from "./db";

export type QuickActionResult = {
  isQuickAction: boolean;
  type: string;
  params: Record<string, unknown>;
  response: string;
};

function normalizeMessage(message: string): string {
  return message.trim().replace(/\s+/g, " ");
}

function parseTimeExpression(timeStr: string): Date | null {
  const now = new Date();
  const lowerTime = timeStr.toLowerCase().trim();

  if (lowerTime === "now") {
    return now;
  }

  if (lowerTime === "noon") {
    const result = new Date(now);
    result.setHours(12, 0, 0, 0);
    if (result <= now) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  if (lowerTime === "midnight") {
    const result = new Date(now);
    result.setHours(0, 0, 0, 0);
    result.setDate(result.getDate() + 1);
    return result;
  }

  if (lowerTime === "tomorrow") {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }

  if (lowerTime === "tonight") {
    const tonight = new Date(now);
    tonight.setHours(20, 0, 0, 0);
    return tonight;
  }

  if (lowerTime === "this afternoon" || lowerTime === "afternoon") {
    const result = new Date(now);
    result.setHours(14, 0, 0, 0);
    if (result <= now) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  if (lowerTime === "this evening" || lowerTime === "evening") {
    const result = new Date(now);
    result.setHours(18, 0, 0, 0);
    if (result <= now) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  if (lowerTime === "this morning" || lowerTime === "morning") {
    const result = new Date(now);
    result.setHours(8, 0, 0, 0);
    if (result <= now) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  const inMatch = lowerTime.match(/^in\s+(\d+)\s+(minute|minutes|min|mins|hour|hours|hr|hrs|day|days)$/i);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2].toLowerCase();
    const result = new Date(now);
    
    if (unit.startsWith("min")) {
      result.setMinutes(result.getMinutes() + amount);
    } else if (unit.startsWith("hour") || unit.startsWith("hr")) {
      result.setHours(result.getHours() + amount);
    } else if (unit.startsWith("day")) {
      result.setDate(result.getDate() + amount);
    }
    return result;
  }

  const timeMatch = lowerTime.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3]?.toLowerCase();

    if (meridiem === "pm" && hours < 12) {
      hours += 12;
    } else if (meridiem === "am" && hours === 12) {
      hours = 0;
    }

    const result = new Date(now);
    result.setHours(hours, minutes, 0, 0);
    
    if (result <= now) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  const tomorrowTimeMatch = lowerTime.match(/^tomorrow\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (tomorrowTimeMatch) {
    let hours = parseInt(tomorrowTimeMatch[1], 10);
    const minutes = tomorrowTimeMatch[2] ? parseInt(tomorrowTimeMatch[2], 10) : 0;
    const meridiem = tomorrowTimeMatch[3]?.toLowerCase();

    if (meridiem === "pm" && hours < 12) {
      hours += 12;
    } else if (meridiem === "am" && hours === 12) {
      hours = 0;
    }

    const result = new Date(now);
    result.setDate(result.getDate() + 1);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }

  const tomorrowNoonMatch = lowerTime.match(/^tomorrow\s+(?:at\s+)?(noon|midnight)$/i);
  if (tomorrowNoonMatch) {
    const result = new Date(now);
    result.setDate(result.getDate() + 1);
    if (tomorrowNoonMatch[1].toLowerCase() === "noon") {
      result.setHours(12, 0, 0, 0);
    } else {
      result.setHours(0, 0, 0, 0);
    }
    return result;
  }

  return null;
}

function formatTime(date: Date): string {
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function handleGroceryCommand(content: string): QuickActionResult {
  const trimmed = normalizeMessage(content);
  
  if (!trimmed) {
    return {
      isQuickAction: true,
      type: "grocery",
      params: {},
      response: "Please specify an item to add. Example: GROCERY milk",
    };
  }

  let itemName = trimmed;
  if (trimmed.toLowerCase().startsWith("add ")) {
    itemName = trimmed.substring(4).trim();
  }

  if (!itemName) {
    return {
      isQuickAction: true,
      type: "grocery",
      params: {},
      response: "Please specify an item to add. Example: GROCERY add milk",
    };
  }

  const quantityMatch = itemName.match(/^(\d+(?:\s*(?:lbs?|oz|kg|g|dozen|pack|box|bag|can|bottle|gallon|qt|pt|cups?|tbsp|tsp))?)\s+(.+)$/i);
  
  let quantity = "1";
  let name = itemName;
  
  if (quantityMatch) {
    quantity = quantityMatch[1].trim();
    name = quantityMatch[2].trim();
  }

  try {
    const item = createGroceryItem({
      name,
      quantity,
      category: "Other",
      addedBy: "SMS",
    });

    return {
      isQuickAction: true,
      type: "grocery",
      params: { name, quantity, itemId: item.id },
      response: `Added "${quantity !== "1" ? quantity + " " : ""}${name}" to grocery list`,
    };
  } catch (error) {
    return {
      isQuickAction: true,
      type: "grocery",
      params: { name, quantity },
      response: `Failed to add item to grocery list`,
    };
  }
}

function handleRemindCommand(content: string): QuickActionResult {
  let trimmed = normalizeMessage(content);
  
  if (trimmed.toLowerCase().startsWith("me ")) {
    trimmed = trimmed.substring(3).trim();
  }
  
  if (trimmed.toLowerCase().startsWith("to ")) {
    trimmed = trimmed.substring(3).trim();
  }

  if (!trimmed) {
    return {
      isQuickAction: true,
      type: "remind",
      params: {},
      response: "Please specify a time and message. Example: REMIND 9am Take medicine",
    };
  }

  const timePatterns = [
    /^(tomorrow(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?)\s+(.+)$/i,
    /^(tomorrow\s+(?:at\s+)?(?:noon|midnight))\s+(.+)$/i,
    /^(tonight)\s+(.+)$/i,
    /^(in\s+\d+\s+(?:minute|minutes|min|mins|hour|hours|hr|hrs|day|days))\s+(.+)$/i,
    /^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(.+)$/i,
    /^(noon|midnight|morning|afternoon|evening)\s+(.+)$/i,
    /^(now)\s+(.+)$/i,
  ];

  const endTimePatterns = [
    /^(.+)\s+at\s+(noon|midnight)$/i,
    /^(.+)\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i,
    /^(.+)\s+at\s+(\d{1,2})$/i,
    /^(.+)\s+(tomorrow(?:\s+(?:at\s+)?(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight))?)$/i,
    /^(.+)\s+(tonight)$/i,
    /^(.+)\s+(in\s+\d+\s+(?:minute|minutes|min|mins|hour|hours|hr|hrs|day|days))$/i,
    /^(.+)\s+(this\s+(?:morning|afternoon|evening))$/i,
  ];

  let timeStr: string | null = null;
  let message: string | null = null;

  for (const pattern of timePatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      timeStr = match[1];
      message = match[2];
      break;
    }
  }

  if (!timeStr || !message) {
    for (const pattern of endTimePatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        message = match[1];
        timeStr = match[2];
        break;
      }
    }
  }

  if (!timeStr || !message) {
    const words = trimmed.split(/\s+/);
    if (words.length >= 2) {
      timeStr = words[0];
      message = words.slice(1).join(" ");
    } else {
      return {
        isQuickAction: true,
        type: "remind",
        params: {},
        response: "Please specify a time and message. Example: REMIND 9am Take medicine",
      };
    }
  }

  const scheduledFor = parseTimeExpression(timeStr);
  
  if (!scheduledFor) {
    return {
      isQuickAction: true,
      type: "remind",
      params: { timeStr, message },
      response: `Couldn't parse time "${timeStr}". Try: 9am, noon, tomorrow, in 2 hours`,
    };
  }

  try {
    const reminder = createReminder({
      message,
      scheduledFor: scheduledFor.toISOString(),
      completed: false,
    });

    return {
      isQuickAction: true,
      type: "remind",
      params: { message, scheduledFor: scheduledFor.toISOString(), reminderId: reminder.id },
      response: `Reminder set for ${formatTime(scheduledFor)}: "${message}"`,
    };
  } catch (error) {
    return {
      isQuickAction: true,
      type: "remind",
      params: { message, timeStr },
      response: `Failed to create reminder`,
    };
  }
}

function handleRememberCommand(content: string): QuickActionResult {
  const trimmed = normalizeMessage(content);
  
  if (!trimmed) {
    return {
      isQuickAction: true,
      type: "remember",
      params: {},
      response: "Please specify what to remember. Example: REMEMBER Mom's birthday is March 15",
    };
  }

  try {
    const note = createMemoryNote({
      type: "fact",
      content: trimmed,
      context: "Added via SMS quick action",
    });

    const preview = trimmed.length > 50 ? trimmed.substring(0, 47) + "..." : trimmed;

    return {
      isQuickAction: true,
      type: "remember",
      params: { content: trimmed, noteId: note.id },
      response: `Remembered: "${preview}"`,
    };
  } catch (error) {
    return {
      isQuickAction: true,
      type: "remember",
      params: { content: trimmed },
      response: `Failed to save memory`,
    };
  }
}

function handleCustomListCommand(content: string): QuickActionResult {
  const trimmed = normalizeMessage(content);
  const words = trimmed.split(" ");
  
  if (words.length === 0 || !trimmed) {
    return {
      isQuickAction: true,
      type: "list",
      params: {},
      response: "Usage:\n- LIST view [name]\n- LIST add [name] [item]\n- LIST check [name] [item]\n- LIST create [name]",
    };
  }

  const subCommand = words[0].toLowerCase();
  
  if (subCommand === "view") {
    if (words.length < 2) {
      try {
        const lists = getAllCustomLists();
        if (lists.length === 0) {
          return {
            isQuickAction: true,
            type: "list",
            params: { subCommand: "view" },
            response: "No lists found. Create one with: LIST create [name]",
          };
        }
        const listNames = lists.map(l => `- ${l.name}`).join("\n");
        return {
          isQuickAction: true,
          type: "list",
          params: { subCommand: "view", available: lists.map(l => l.name) },
          response: `Available lists:\n${listNames}\n\nView a list with: LIST view [name]`,
        };
      } catch (error) {
        return {
          isQuickAction: true,
          type: "list",
          params: { subCommand: "view" },
          response: "Failed to get lists",
        };
      }
    }

    const listName = words.slice(1).join(" ");
    return viewList(listName);
  }
  
  if (subCommand === "add") {
    if (words.length < 3) {
      return {
        isQuickAction: true,
        type: "list",
        params: { subCommand: "add" },
        response: "Please specify list name and item. Example: LIST add packing passport",
      };
    }

    const listName = words[1];
    const item = words.slice(2).join(" ");
    return addToList(listName, item);
  }
  
  if (subCommand === "check") {
    if (words.length < 3) {
      return {
        isQuickAction: true,
        type: "list",
        params: { subCommand: "check" },
        response: "Please specify list name and item. Example: LIST check packing passport",
      };
    }

    const listName = words[1];
    const itemSearch = words.slice(2).join(" ").toLowerCase();
    return checkListItem(listName, itemSearch);
  }
  
  if (subCommand === "create") {
    if (words.length < 2) {
      return {
        isQuickAction: true,
        type: "list",
        params: { subCommand: "create" },
        response: "Please specify a name for the list. Example: LIST create packing",
      };
    }

    const listName = words.slice(1).join(" ");
    return createNewList(listName);
  }

  const existingList = getCustomListByName(subCommand);
  if (existingList) {
    return viewList(subCommand);
  }

  return {
    isQuickAction: true,
    type: "list",
    params: { unknownCommand: subCommand },
    response: `Unknown LIST command "${subCommand}". Try:\n- LIST view [name]\n- LIST add [name] [item]\n- LIST check [name] [item]\n- LIST create [name]`,
  };
}

function viewList(listName: string): QuickActionResult {
  try {
    const list = getCustomListByName(listName);
    if (!list) {
      const allLists = getAllCustomLists();
      if (allLists.length === 0) {
        return {
          isQuickAction: true,
          type: "list",
          params: { subCommand: "view", listName },
          response: `List "${listName}" not found. Create it with: LIST create ${listName}`,
        };
      }
      const suggestions = allLists.slice(0, 3).map(l => l.name).join(", ");
      return {
        isQuickAction: true,
        type: "list",
        params: { subCommand: "view", listName },
        response: `List "${listName}" not found. Available: ${suggestions}`,
      };
    }

    const items = getCustomListItems(list.id);
    if (items.length === 0) {
      return {
        isQuickAction: true,
        type: "list",
        params: { subCommand: "view", listName: list.name, listId: list.id },
        response: `${list.name} is empty. Add items with: LIST add ${list.name.toLowerCase()} [item]`,
      };
    }

    const unchecked = items.filter(i => !i.checked);
    const checked = items.filter(i => i.checked);

    let response = `${list.name.toUpperCase()}:\n`;
    
    if (unchecked.length > 0) {
      response += unchecked.map(i => `- ${i.content}`).join("\n");
    }

    if (checked.length > 0) {
      if (unchecked.length > 0) response += "\n\n";
      response += "DONE:\n";
      response += checked.map(i => `✓ ${i.content}`).join("\n");
    }

    return {
      isQuickAction: true,
      type: "list",
      params: { subCommand: "view", listName: list.name, listId: list.id, itemCount: items.length },
      response,
    };
  } catch (error) {
    return {
      isQuickAction: true,
      type: "list",
      params: { subCommand: "view", listName },
      response: `Failed to view list "${listName}"`,
    };
  }
}

function addToList(listName: string, item: string): QuickActionResult {
  try {
    let list = getCustomListByName(listName);
    
    if (!list) {
      list = createCustomList({
        name: listName.charAt(0).toUpperCase() + listName.slice(1).toLowerCase(),
        type: "custom",
        isShared: false,
      });
    }

    const newItem = createCustomListItem({
      listId: list.id,
      content: item,
      addedBy: "SMS",
    });

    return {
      isQuickAction: true,
      type: "list",
      params: { subCommand: "add", listName: list.name, listId: list.id, item, itemId: newItem.id },
      response: `Added "${item}" to ${list.name}`,
    };
  } catch (error) {
    return {
      isQuickAction: true,
      type: "list",
      params: { subCommand: "add", listName, item },
      response: `Failed to add item to list`,
    };
  }
}

function checkListItem(listName: string, itemSearch: string): QuickActionResult {
  try {
    const list = getCustomListByName(listName);
    if (!list) {
      return {
        isQuickAction: true,
        type: "list",
        params: { subCommand: "check", listName, itemSearch },
        response: `List "${listName}" not found. Create it with: LIST create ${listName}`,
      };
    }

    const items = getCustomListItems(list.id);
    const matchingItem = items.find(i => 
      i.content.toLowerCase().includes(itemSearch) && !i.checked
    );

    if (!matchingItem) {
      const uncheckedItems = items.filter(i => !i.checked);
      if (uncheckedItems.length === 0) {
        return {
          isQuickAction: true,
          type: "list",
          params: { subCommand: "check", listName: list.name, itemSearch },
          response: `All items in ${list.name} are already checked off!`,
        };
      }
      return {
        isQuickAction: true,
        type: "list",
        params: { subCommand: "check", listName: list.name, itemSearch },
        response: `Item "${itemSearch}" not found in ${list.name}. Unchecked items: ${uncheckedItems.slice(0, 3).map(i => i.content).join(", ")}`,
      };
    }

    toggleCustomListItemChecked(matchingItem.id);

    return {
      isQuickAction: true,
      type: "list",
      params: { subCommand: "check", listName: list.name, listId: list.id, item: matchingItem.content, itemId: matchingItem.id },
      response: `Checked off "${matchingItem.content}" in ${list.name}`,
    };
  } catch (error) {
    return {
      isQuickAction: true,
      type: "list",
      params: { subCommand: "check", listName, itemSearch },
      response: `Failed to check off item`,
    };
  }
}

function createNewList(listName: string): QuickActionResult {
  try {
    const existing = getCustomListByName(listName);
    if (existing) {
      return {
        isQuickAction: true,
        type: "list",
        params: { subCommand: "create", listName: existing.name, listId: existing.id },
        response: `List "${existing.name}" already exists. View it with: LIST view ${existing.name.toLowerCase()}`,
      };
    }

    const list = createCustomList({
      name: listName.charAt(0).toUpperCase() + listName.slice(1).toLowerCase(),
      type: "custom",
      isShared: false,
    });

    return {
      isQuickAction: true,
      type: "list",
      params: { subCommand: "create", listName: list.name, listId: list.id },
      response: `Created list "${list.name}". Add items with: LIST add ${list.name.toLowerCase()} [item]`,
    };
  } catch (error) {
    return {
      isQuickAction: true,
      type: "list",
      params: { subCommand: "create", listName },
      response: `Failed to create list`,
    };
  }
}

function handleListCommand(content: string): QuickActionResult {
  const listType = normalizeMessage(content).toLowerCase();

  if (listType === "grocery" || listType === "groceries") {
    try {
      const items = getAllGroceryItems();
      const toBuy = items.filter((i) => !i.purchased);
      const purchased = items.filter((i) => i.purchased);

      if (items.length === 0) {
        return {
          isQuickAction: true,
          type: "list",
          params: { listType: "grocery" },
          response: "Grocery list is empty",
        };
      }

      let response = "";
      
      if (toBuy.length > 0) {
        response += "TO BUY:\n";
        response += toBuy
          .map((i) => `- ${i.quantity !== "1" ? i.quantity + " " : ""}${i.name}`)
          .join("\n");
      }

      if (purchased.length > 0) {
        if (response) response += "\n\n";
        response += "PURCHASED:\n";
        response += purchased.map((i) => `✓ ${i.name}`).join("\n");
      }

      return {
        isQuickAction: true,
        type: "list",
        params: { listType: "grocery", count: items.length },
        response,
      };
    } catch (error) {
      return {
        isQuickAction: true,
        type: "list",
        params: { listType: "grocery" },
        response: "Failed to get grocery list",
      };
    }
  }

  if (listType === "todo" || listType === "todos" || listType === "task" || listType === "tasks") {
    try {
      const tasks = getAllTasks(false);

      if (tasks.length === 0) {
        return {
          isQuickAction: true,
          type: "list",
          params: { listType: "tasks" },
          response: "No pending tasks",
        };
      }

      const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      const sortedTasks = tasks.sort((a, b) => {
        if (a.dueDate && b.dueDate) {
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        }
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      const response = sortedTasks
        .slice(0, 10)
        .map((t) => {
          const priority = t.priority === "high" ? "!" : t.priority === "low" ? "·" : "-";
          const due = t.dueDate
            ? ` (${new Date(t.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })})`
            : "";
          return `${priority} ${t.title}${due}`;
        })
        .join("\n");

      const suffix = tasks.length > 10 ? `\n... and ${tasks.length - 10} more` : "";

      return {
        isQuickAction: true,
        type: "list",
        params: { listType: "tasks", count: tasks.length },
        response: `TASKS (${tasks.length}):\n${response}${suffix}`,
      };
    } catch (error) {
      return {
        isQuickAction: true,
        type: "list",
        params: { listType: "tasks" },
        response: "Failed to get tasks",
      };
    }
  }

  return handleCustomListCommand(content);
}

export function parseQuickAction(message: string): QuickActionResult {
  const trimmed = normalizeMessage(message);
  
  if (!trimmed) {
    return {
      isQuickAction: false,
      type: "",
      params: {},
      response: "",
    };
  }

  const upperMessage = trimmed.toUpperCase();
  const lowerMessage = trimmed.toLowerCase();

  console.log(`[QuickAction] Parsing message: "${trimmed.substring(0, 80)}${trimmed.length > 80 ? '...' : ''}"`);

  if (upperMessage.startsWith("GROCERY ") || upperMessage === "GROCERY") {
    const content = trimmed.substring(7).trim();
    console.log(`[QuickAction] Matched GROCERY command, item: "${content}"`);
    return handleGroceryCommand(content);
  }

  // Natural language grocery patterns:
  // "X to grocery list", "add X to grocery list", "put X on grocery list", "X on grocery list"
  // "add X to groceries", "X to groceries", "buy X", "need X", "pick up X", "get X", etc.
  const groceryPatterns = [
    // Explicit grocery list mentions - more flexible matching
    /^(?:add\s+)?(.+?)\s+to\s+(?:the\s+)?(?:my\s+)?(?:grocery\s*list|groceries)$/i,
    /^(?:put\s+)?(.+?)\s+(?:on|to)\s+(?:the\s+)?(?:my\s+)?(?:grocery\s*list|groceries)$/i,
    // Also match with "grocery" alone at the end (common SMS shorthand)
    /^(?:add\s+)?(.+?)\s+to\s+(?:the\s+)?(?:my\s+)?grocery$/i,
    // Shopping intent patterns - "buy X", "need to buy X"
    /^(?:need\s+to\s+)?buy\s+(?:some\s+)?(.+)$/i,
    // "pick up X", "get X from store"
    /^pick\s+up\s+(?:some\s+)?(.+?)(?:\s+from\s+(?:the\s+)?store)?$/i,
    /^get\s+(?:some\s+)?(.+?)\s+from\s+(?:the\s+)?(?:store|grocery|market)$/i,
    // "we need X", "I need X", "need X" (but not "need to X" which is a task)
    /^(?:we|i)\s+need\s+(?:some\s+)?(.+?)(?:\s+from\s+(?:the\s+)?(?:store|grocery|market))?$/i,
    /^need\s+(?:some\s+)?(.+?)(?:\s+from\s+(?:the\s+)?(?:store|grocery|market))$/i,
    // "out of X", "running low on X", "we're out of X"
    /^(?:we(?:'re|'re| are)?\s+)?(?:out\s+of|running\s+low\s+on)\s+(.+)$/i,
    // "add X to shopping list"
    /^(?:add\s+)?(.+?)\s+to\s+(?:the\s+)?(?:my\s+)?shopping\s*list$/i,
  ];

  for (const pattern of groceryPatterns) {
    const match = lowerMessage.match(pattern);
    if (match) {
      // Extract the item from the original trimmed message to preserve case
      const itemMatch = trimmed.match(pattern);
      const item = itemMatch ? itemMatch[1].trim() : match[1].trim();
      if (item) {
        console.log(`[QuickAction] Matched grocery pattern, item: "${item}"`);
        return handleGroceryCommand(item);
      }
    }
  }
  
  // Fallback: Check for simple "grocery list" mention at end of message
  if (lowerMessage.endsWith("to grocery list") || lowerMessage.endsWith("to groceries") || 
      lowerMessage.endsWith("to the grocery list") || lowerMessage.endsWith("on grocery list")) {
    // Extract everything before the grocery suffix
    const suffixes = ["to the grocery list", "to grocery list", "to groceries", "on grocery list"];
    for (const suffix of suffixes) {
      if (lowerMessage.endsWith(suffix)) {
        let item = trimmed.slice(0, -suffix.length).trim();
        // Remove "add" prefix if present
        if (item.toLowerCase().startsWith("add ")) {
          item = item.slice(4).trim();
        }
        if (item) {
          console.log(`[QuickAction] Matched grocery fallback, item: "${item}"`);
          return handleGroceryCommand(item);
        }
      }
    }
  }

  if (upperMessage.startsWith("REMIND ") || upperMessage === "REMIND") {
    const content = trimmed.substring(6).trim();
    return handleRemindCommand(content);
  }

  // Natural language reminder patterns:
  // "don't forget X", "don't let me forget X", "remind me to X"
  // We strip the prefix and pass the FULL remainder to handleRemindCommand so it can parse the time
  const reminderPrefixes = [
    /^don'?t\s+(?:let\s+me\s+)?forget\s+(?:to\s+)?/i,
    /^remind\s+me\s+(?:to\s+)?/i,
  ];

  for (const prefix of reminderPrefixes) {
    if (prefix.test(lowerMessage)) {
      const content = trimmed.replace(prefix, "").trim();
      if (content) {
        return handleRemindCommand(content);
      }
    }
  }

  if (upperMessage.startsWith("REMEMBER ") || upperMessage === "REMEMBER") {
    const content = trimmed.substring(8).trim();
    return handleRememberCommand(content);
  }

  // Natural language memory patterns:
  // "note that X", "keep in mind X", "note: X", "fyi X"
  const memoryPatterns = [
    /^note\s+that\s+(.+)$/i,
    /^note:\s*(.+)$/i,
    /^keep\s+in\s+mind\s+(?:that\s+)?(.+)$/i,
    /^fyi\s+(.+)$/i,
    /^just\s+so\s+(?:you\s+know|i\s+know)\s+(.+)$/i,
  ];

  for (const pattern of memoryPatterns) {
    const match = lowerMessage.match(pattern);
    if (match) {
      const itemMatch = trimmed.match(pattern);
      const content = itemMatch ? itemMatch[1].trim() : match[1].trim();
      if (content) {
        return handleRememberCommand(content);
      }
    }
  }

  if (upperMessage.startsWith("LIST ") || upperMessage === "LIST") {
    const content = trimmed.substring(4).trim();
    if (!content) {
      return {
        isQuickAction: true,
        type: "list",
        params: {},
        response: "Usage:\n- LIST grocery/tasks\n- LIST view [name]\n- LIST add [name] [item]\n- LIST check [name] [item]\n- LIST create [name]",
      };
    }
    return handleListCommand(content);
  }

  console.log(`[QuickAction] No pattern matched for: "${trimmed.substring(0, 50)}${trimmed.length > 50 ? '...' : ''}"`);
  return {
    isQuickAction: false,
    type: "",
    params: {},
    response: "",
  };
}
