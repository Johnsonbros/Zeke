# ZEKE Tool Reference

This document catalogs tools available to ZEKE's agents, organized by category.

> **Note**: For the authoritative list of tools, check the `ToolDefinition` entries in each agent file under `python_agents/agents/`. This document provides a representative overview.

## Overview

Tools are registered with agents via `ToolDefinition` and executed either:
- **Locally** in Python (handler function)
- **Via Bridge** to Node.js backend (using `create_bridge_tool`)

## Communication Tools

### send_sms
**Agent**: CommsPilot  
**Type**: Bridge

Send an SMS message via Twilio.

```json
{
  "phone_number": "+16175551234",
  "message": "Your reminder: Dentist appointment at 2pm"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| phone_number | string | Yes | Phone number with country code |
| message | string | Yes | Message text (max 1600 chars) |

---

### configure_daily_checkin
**Agent**: CommsPilot  
**Type**: Bridge

Set up daily check-in questions.

```json
{
  "phone_number": "+16175551234",
  "time": "09:00"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| phone_number | string | Yes | Target phone number |
| time | string | No | Time in 24h format (default: 09:00) |

---

### get_daily_checkin_status
**Agent**: CommsPilot  
**Type**: Bridge

Get current check-in configuration status.

```json
{}
```

**Returns**: enabled, time, phone_number

---

### lookup_contact
**Agent**: CommsPilot  
**Type**: Bridge

Look up a contact by name.

```json
{
  "name": "Mom"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | Yes | Contact name to search |

## Task Management Tools

### add_task
**Agent**: OpsPlanner  
**Type**: Bridge

Add a new task to the to-do list.

```json
{
  "title": "Buy groceries",
  "description": "Get milk, eggs, bread",
  "priority": "medium",
  "due_date": "2024-12-20",
  "category": "personal"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| title | string | Yes | Task title |
| description | string | No | Detailed description |
| priority | enum | No | low, medium, high (default: medium) |
| due_date | string | No | ISO 8601 date |
| category | enum | No | work, personal, family (default: personal) |

---

### list_tasks
**Agent**: OpsPlanner  
**Type**: Bridge

List tasks with optional filters.

```json
{
  "include_completed": false,
  "category": "work",
  "show_overdue": true
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| include_completed | boolean | No | Include done tasks (default: false) |
| category | enum | No | Filter by category |
| show_overdue | boolean | No | Only show overdue tasks |

---

### complete_task
**Agent**: OpsPlanner  
**Type**: Bridge

Mark a task as complete.

```json
{
  "task_id": "abc123"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| task_id | string | Yes | Task ID to complete |

---

### update_task
**Agent**: OpsPlanner  
**Type**: Bridge

Update task properties.

```json
{
  "task_id": "abc123",
  "title": "Updated title",
  "priority": "high"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| task_id | string | Yes | Task ID |
| title | string | No | New title |
| description | string | No | New description |
| priority | enum | No | New priority |
| due_date | string | No | New due date |
| category | enum | No | New category |

---

### delete_task
**Agent**: OpsPlanner  
**Type**: Bridge

Delete a task.

```json
{
  "task_id": "abc123"
}
```

## Calendar Tools

### get_calendar_events
**Agent**: OpsPlanner  
**Type**: Bridge

Get calendar events for a date range.

```json
{
  "start_date": "2024-12-17",
  "end_date": "2024-12-24",
  "limit": 10
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| start_date | string | No | Start of range (default: today) |
| end_date | string | No | End of range (default: 7 days) |
| limit | number | No | Max events (default: 10) |

---

### create_calendar_event
**Agent**: OpsPlanner  
**Type**: Bridge

Create a new calendar event.

```json
{
  "title": "Team Meeting",
  "start_time": "2024-12-18T10:00:00",
  "end_time": "2024-12-18T11:00:00",
  "description": "Weekly sync",
  "location": "Conference Room A"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| title | string | Yes | Event title |
| start_time | string | Yes | ISO 8601 datetime |
| end_time | string | Yes | ISO 8601 datetime |
| description | string | No | Event description |
| location | string | No | Event location |

---

### update_calendar_event
**Agent**: OpsPlanner  
**Type**: Bridge

Update an existing event.

```json
{
  "event_id": "abc123",
  "title": "Updated Meeting",
  "start_time": "2024-12-18T11:00:00"
}
```

---

### delete_calendar_event
**Agent**: OpsPlanner  
**Type**: Bridge

Delete a calendar event.

```json
{
  "event_id": "abc123"
}
```

## Reminder Tools

### add_reminder
**Agent**: OpsPlanner  
**Type**: Bridge

Set a reminder.

```json
{
  "message": "Take medication",
  "time": "2024-12-17T20:00:00",
  "repeat": "daily"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| message | string | Yes | Reminder text |
| time | string | Yes | ISO 8601 datetime |
| repeat | enum | No | none, daily, weekly, monthly |

---

### list_reminders
**Agent**: OpsPlanner  
**Type**: Bridge

List active reminders.

```json
{
  "include_past": false
}
```

---

### cancel_reminder
**Agent**: OpsPlanner  
**Type**: Bridge

Cancel a reminder.

```json
{
  "reminder_id": "abc123"
}
```

## Grocery Tools

### add_grocery_item
**Agent**: OpsPlanner  
**Type**: Bridge

Add item to grocery list.

```json
{
  "item": "Milk",
  "quantity": 2,
  "unit": "gallons",
  "category": "dairy"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| item | string | Yes | Item name |
| quantity | number | No | Amount (default: 1) |
| unit | string | No | Unit of measure |
| category | string | No | Category (e.g., dairy, produce) |

---

### get_grocery_list
**Agent**: OpsPlanner  
**Type**: Bridge

Get current grocery list.

```json
{
  "include_purchased": false
}
```

---

### mark_grocery_purchased
**Agent**: OpsPlanner  
**Type**: Bridge

Mark item as purchased.

```json
{
  "item_id": "abc123"
}
```

---

### clear_grocery_list
**Agent**: OpsPlanner  
**Type**: Bridge

Clear all purchased items.

```json
{}
```

## Search Tools

### web_search
**Agent**: ResearchScout  
**Type**: Bridge

Basic web search via DuckDuckGo.

```json
{
  "query": "best Italian restaurants Boston"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search query |

---

### perplexity_search
**Agent**: ResearchScout  
**Type**: Bridge

AI-powered search via Perplexity. **Preferred for complex queries.**

```json
{
  "query": "How do I set up a 529 college savings plan?",
  "recency": "month"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search query (can be conversational) |
| recency | enum | No | day, week, month, year |

## Memory Tools

### search_memories
**Agent**: MemoryCurator  
**Type**: Local

Search semantic memories.

```json
{
  "query": "meeting preferences",
  "scope": "persona:*",
  "limit": 10
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search query |
| scope | string | No | Scope filter (supports wildcards) |
| limit | number | No | Max results (default: 10) |

---

### store_memory
**Agent**: MemoryCurator  
**Type**: Local

Store a new memory.

```json
{
  "text": "User prefers morning meetings",
  "scope": "persona:preferences",
  "tags": ["scheduling"]
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| text | string | Yes | Memory content |
| scope | string | Yes | Memory scope |
| tags | array | No | Categorization tags |

## Lifelog Tools

### search_lifelogs
**Agent**: MemoryCurator, OmiAnalyst  
**Type**: Bridge

Search Omi pendant recordings.

```json
{
  "query": "conversation about project budget",
  "limit": 5,
  "date": "2024-12-15",
  "starred_only": false
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search query |
| limit | number | No | Max results (default: 5) |
| date | string | No | Filter to date (YYYY-MM-DD) |
| starred_only | boolean | No | Only starred recordings |

---

### get_recent_lifelogs
**Agent**: MemoryCurator, OmiAnalyst  
**Type**: Bridge

Get recent recordings.

```json
{
  "hours": 24,
  "limit": 10,
  "today_only": true
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| hours | number | No | Hours to look back (default: 24) |
| limit | number | No | Max results (default: 10) |
| today_only | boolean | No | Only today's recordings |

---

### get_lifelog_overview
**Agent**: OmiAnalyst  
**Type**: Bridge

Get lifelog data summary.

```json
{}
```

**Returns**: Today's count, yesterday's count, 7-day count, most recent recording

---

### get_lifelog_details
**Agent**: OmiAnalyst  
**Type**: Bridge

Get detailed info for a specific recording.

```json
{
  "lifelog_id": "abc123"
}
```

## Utility Tools

### get_weather
**Agent**: OpsPlanner  
**Type**: Bridge

Get weather forecast.

```json
{
  "location": "Boston, MA",
  "days": 3
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| location | string | No | Location (default: user's location) |
| days | number | No | Forecast days (default: 1) |

---

### get_current_time
**Agent**: OpsPlanner, SafetyAuditor  
**Type**: Local

Get current time.

```json
{
  "format": "12h"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| format | enum | No | 12h or 24h (default: 12h) |

---

### check_omi_status
**Agent**: SafetyAuditor  
**Type**: Bridge

Check Omi pendant connectivity.

```json
{}
```

**Returns**: Connected status, last sync time, error if any

## Document Tools

### list_documents
**Agent**: Conductor  
**Type**: Bridge

List user documents.

```json
{
  "folder_id": "abc123",
  "include_subfolders": true
}
```

---

### read_document
**Agent**: Conductor  
**Type**: Bridge

Read document content.

```json
{
  "document_id": "abc123"
}
```

---

### create_document
**Agent**: Conductor  
**Type**: Bridge

Create a new document.

```json
{
  "title": "Meeting Notes",
  "content": "...",
  "folder_id": "abc123"
}
```

---

### update_document
**Agent**: Conductor  
**Type**: Bridge

Update document content.

```json
{
  "document_id": "abc123",
  "content": "Updated content..."
}
```

---

### search_documents
**Agent**: Conductor  
**Type**: Bridge

Search documents by content.

```json
{
  "query": "project timeline"
}
```

## Adding New Tools

### Bridge Tool (Node.js)

1. Implement in Node.js (`server/tools/`)
2. Register with bridge
3. Create tool definition:

```python
from .base import create_bridge_tool

my_tool = create_bridge_tool(
    tool_name="my_tool",
    description="What it does",
    parameters={
        "type": "object",
        "properties": {...},
        "required": [...],
    }
)
```

### Local Tool (Python)

```python
ToolDefinition(
    name="my_local_tool",
    description="What it does",
    parameters={...},
    handler=self._handle_my_tool,
)

async def _handle_my_tool(self, ctx: Any, args: str) -> str:
    arguments = json.loads(args)
    # Implementation
    return json.dumps({"success": True, "data": result})
```

## Tool Response Format

All tools should return JSON with consistent structure:

**Success**:
```json
{
  "success": true,
  "data": {...}
}
```

**Error**:
```json
{
  "success": false,
  "error": "Human-readable error message",
  "recoverable": true
}
```
