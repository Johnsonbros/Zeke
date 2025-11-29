"""
Operations Planner Agent - ZEKE's scheduling and task management specialist.

This module implements the Ops Planner agent responsible for:
- Task management (add, update, complete, delete tasks)
- Reminder scheduling and management
- Calendar event management via Google Calendar
- Grocery list management for the household
- Time and weather utilities

The Ops Planner handles all operational planning needs for Nate,
providing natural language confirmations and helpful summaries.
"""

from dataclasses import dataclass, field
from typing import Any
import logging
import json

from agents import Agent, Runner

from .base import (
    BaseAgent,
    AgentId,
    AgentStatus,
    AgentContext,
    CapabilityCategory,
    HandoffRequest,
    HandoffReason,
    ToolDefinition,
)
from ..bridge import get_bridge


logger = logging.getLogger(__name__)


OPS_PLANNER_INSTRUCTIONS = """You are the Operations Planner, ZEKE's scheduling and task management specialist. Your role is to:
1. Manage Nate's tasks, reminders, and calendar events
2. Maintain the household grocery list shared with Shakita
3. Provide helpful time and weather information
4. Give natural language confirmations and summaries after each action

TASK MANAGEMENT:
- Add tasks with appropriate priorities and due dates
- Track tasks by category: work, personal, or family
- Provide clear summaries when listing tasks
- Mark tasks complete with encouraging confirmations

REMINDERS:
- Set reminders with flexible timing (delay in minutes or scheduled time)
- Reminders can go to the current conversation or via SMS
- Always confirm the reminder time in a natural way

CALENDAR:
- Integrate with Google Calendar for event management
- When creating events, confirm all details clearly
- Provide helpful summaries of upcoming events
- Handle date/time parsing gracefully

GROCERY LIST:
- The grocery list is shared between Nate, Shakita, and ZEKE
- Organize items by category (Produce, Dairy, Meat, Bakery, etc.)
- Track who added each item
- Provide clear list summaries organized by category

COMMUNICATION STYLE:
- Give natural, conversational confirmations (not robotic responses)
- Summarize actions taken in a helpful way
- When listing items, organize them logically
- Be proactive about suggesting related information

Example responses:
- "Got it! I've added 'Review quarterly report' to your work tasks with high priority, due tomorrow."
- "Here's your shopping list - you have 8 items across 4 categories. Need anything else?"
- "You have 3 events today: standup at 9am, lunch with Sarah at noon, and the team meeting at 3pm."

Always aim to be helpful and anticipate what information Nate might need next."""


@dataclass
class TaskResult:
    """
    Result from a task operation.
    
    Attributes:
        success: Whether the operation succeeded
        task: The task data if applicable
        message: Human-readable result message
        error: Error message if failed
    """
    success: bool
    task: dict[str, Any] | None = None
    message: str = ""
    error: str | None = None


@dataclass
class ReminderResult:
    """
    Result from a reminder operation.
    
    Attributes:
        success: Whether the operation succeeded
        reminder_id: ID of the reminder if created/modified
        scheduled_time: When the reminder is scheduled
        message: Human-readable result message
        error: Error message if failed
    """
    success: bool
    reminder_id: str | None = None
    scheduled_time: str | None = None
    message: str = ""
    error: str | None = None


@dataclass
class CalendarResult:
    """
    Result from a calendar operation.
    
    Attributes:
        success: Whether the operation succeeded
        event: The event data if applicable
        events: List of events if fetching multiple
        message: Human-readable result message
        error: Error message if failed
    """
    success: bool
    event: dict[str, Any] | None = None
    events: list[dict[str, Any]] = field(default_factory=list)
    message: str = ""
    error: str | None = None


@dataclass
class GroceryResult:
    """
    Result from a grocery list operation.
    
    Attributes:
        success: Whether the operation succeeded
        item: The grocery item if applicable
        items: List of items if fetching multiple
        message: Human-readable result message
        error: Error message if failed
    """
    success: bool
    item: dict[str, Any] | None = None
    items: list[dict[str, Any]] = field(default_factory=list)
    message: str = ""
    error: str | None = None


class OpsPlannerAgent(BaseAgent):
    """
    Operations Planner Agent - ZEKE's scheduling and task management specialist.
    
    This agent is responsible for:
    - Task management with priorities, due dates, and categories
    - Reminder scheduling and management
    - Google Calendar integration for events
    - Household grocery list management
    - Time and weather utilities
    
    The Ops Planner integrates with Node.js capabilities via the bridge
    and provides natural language confirmations for all operations.
    
    Attributes:
        agent_id: OPS_PLANNER
        capabilities: [SCHEDULING, TASK_MANAGEMENT, GROCERY]
        handoff_targets: [CONDUCTOR, MEMORY_CURATOR]
    """
    
    async def _handle_add_task(self, ctx: Any, args: str) -> str:
        """Handler for add_task tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("add_task", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"add_task execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_list_tasks(self, ctx: Any, args: str) -> str:
        """Handler for list_tasks tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("list_tasks", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"list_tasks execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_update_task(self, ctx: Any, args: str) -> str:
        """Handler for update_task tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("update_task", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"update_task execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_complete_task(self, ctx: Any, args: str) -> str:
        """Handler for complete_task tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("complete_task", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"complete_task execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_delete_task(self, ctx: Any, args: str) -> str:
        """Handler for delete_task tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("delete_task", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"delete_task execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_clear_completed_tasks(self, ctx: Any, args: str) -> str:
        """Handler for clear_completed_tasks tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("clear_completed_tasks", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"clear_completed_tasks execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_set_reminder(self, ctx: Any, args: str) -> str:
        """Handler for set_reminder tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("set_reminder", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"set_reminder execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_list_reminders(self, ctx: Any, args: str) -> str:
        """Handler for list_reminders tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("list_reminders", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"list_reminders execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_cancel_reminder(self, ctx: Any, args: str) -> str:
        """Handler for cancel_reminder tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("cancel_reminder", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"cancel_reminder execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_get_calendar_events(self, ctx: Any, args: str) -> str:
        """Handler for get_calendar_events tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("get_calendar_events", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"get_calendar_events execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_get_today_events(self, ctx: Any, args: str) -> str:
        """Handler for get_today_events tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("get_today_events", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"get_today_events execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_get_upcoming_events(self, ctx: Any, args: str) -> str:
        """Handler for get_upcoming_events tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("get_upcoming_events", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"get_upcoming_events execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_create_calendar_event(self, ctx: Any, args: str) -> str:
        """Handler for create_calendar_event tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("create_calendar_event", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"create_calendar_event execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_update_calendar_event(self, ctx: Any, args: str) -> str:
        """Handler for update_calendar_event tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("update_calendar_event", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"update_calendar_event execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_delete_calendar_event(self, ctx: Any, args: str) -> str:
        """Handler for delete_calendar_event tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("delete_calendar_event", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"delete_calendar_event execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_add_grocery_item(self, ctx: Any, args: str) -> str:
        """Handler for add_grocery_item tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("add_grocery_item", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"add_grocery_item execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_list_grocery_items(self, ctx: Any, args: str) -> str:
        """Handler for list_grocery_items tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("list_grocery_items", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"list_grocery_items execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_mark_grocery_purchased(self, ctx: Any, args: str) -> str:
        """Handler for mark_grocery_purchased tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("mark_grocery_purchased", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"mark_grocery_purchased execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_remove_grocery_item(self, ctx: Any, args: str) -> str:
        """Handler for remove_grocery_item tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("remove_grocery_item", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"remove_grocery_item execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_clear_purchased_groceries(self, ctx: Any, args: str) -> str:
        """Handler for clear_purchased_groceries tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("clear_purchased_groceries", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"clear_purchased_groceries execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_clear_all_groceries(self, ctx: Any, args: str) -> str:
        """Handler for clear_all_groceries tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("clear_all_groceries", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"clear_all_groceries execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_get_current_time(self, ctx: Any, args: str) -> str:
        """Handler for get_current_time tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("get_current_time", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"get_current_time execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_get_weather(self, ctx: Any, args: str) -> str:
        """Handler for get_weather tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("get_weather", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"get_weather execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    def __init__(self):
        """Initialize the Operations Planner agent with its tools and configuration."""
        tool_definitions = [
            ToolDefinition(
                name="add_task",
                description="Add a task to the to-do list. Use for any task, to-do item, or action item Nate mentions.",
                parameters={
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "The task title/description",
                        },
                        "description": {
                            "type": "string",
                            "description": "Optional longer description or notes for the task",
                        },
                        "priority": {
                            "type": "string",
                            "enum": ["low", "medium", "high"],
                            "description": "Task priority. Default is 'medium'.",
                        },
                        "due_date": {
                            "type": "string",
                            "description": "Due date in ISO 8601 format (e.g., '2024-01-15' or '2024-01-15T14:30:00'). Optional.",
                        },
                        "category": {
                            "type": "string",
                            "enum": ["work", "personal", "family"],
                            "description": "Task category. Default is 'personal'.",
                        },
                    },
                    "required": ["title"],
                },
                handler=self._handle_add_task,
            ),
            ToolDefinition(
                name="list_tasks",
                description="List all tasks, optionally filtered by category or status. Shows pending tasks by default.",
                parameters={
                    "type": "object",
                    "properties": {
                        "include_completed": {
                            "type": "boolean",
                            "description": "Whether to include completed tasks. Default is false.",
                        },
                        "category": {
                            "type": "string",
                            "enum": ["work", "personal", "family"],
                            "description": "Filter by category. If not provided, shows all categories.",
                        },
                        "show_overdue": {
                            "type": "boolean",
                            "description": "Only show overdue tasks.",
                        },
                        "show_due_today": {
                            "type": "boolean",
                            "description": "Only show tasks due today.",
                        },
                    },
                    "required": [],
                },
                handler=self._handle_list_tasks,
            ),
            ToolDefinition(
                name="update_task",
                description="Update an existing task by ID or partial title match.",
                parameters={
                    "type": "object",
                    "properties": {
                        "task_identifier": {
                            "type": "string",
                            "description": "The task ID or partial title to find the task",
                        },
                        "title": {
                            "type": "string",
                            "description": "New title for the task",
                        },
                        "description": {
                            "type": "string",
                            "description": "New description for the task",
                        },
                        "priority": {
                            "type": "string",
                            "enum": ["low", "medium", "high"],
                            "description": "New priority level",
                        },
                        "due_date": {
                            "type": "string",
                            "description": "New due date in ISO 8601 format, or null to remove",
                        },
                        "category": {
                            "type": "string",
                            "enum": ["work", "personal", "family"],
                            "description": "New category",
                        },
                    },
                    "required": ["task_identifier"],
                },
                handler=self._handle_update_task,
            ),
            ToolDefinition(
                name="complete_task",
                description="Mark a task as completed (or toggle back to incomplete).",
                parameters={
                    "type": "object",
                    "properties": {
                        "task_identifier": {
                            "type": "string",
                            "description": "The task ID or partial title to find and complete the task",
                        },
                    },
                    "required": ["task_identifier"],
                },
                handler=self._handle_complete_task,
            ),
            ToolDefinition(
                name="delete_task",
                description="Delete a task from the to-do list entirely.",
                parameters={
                    "type": "object",
                    "properties": {
                        "task_identifier": {
                            "type": "string",
                            "description": "The task ID or partial title to find and delete the task",
                        },
                    },
                    "required": ["task_identifier"],
                },
                handler=self._handle_delete_task,
            ),
            ToolDefinition(
                name="clear_completed_tasks",
                description="Clear all completed tasks from the to-do list.",
                parameters={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
                handler=self._handle_clear_completed_tasks,
            ),
            ToolDefinition(
                name="set_reminder",
                description="Set a reminder to send a message at a specific time. Can remind via the current conversation or send an SMS.",
                parameters={
                    "type": "object",
                    "properties": {
                        "message": {
                            "type": "string",
                            "description": "The reminder message to send",
                        },
                        "delay_minutes": {
                            "type": "number",
                            "description": "Number of minutes from now to send the reminder. Use this OR scheduled_time, not both.",
                        },
                        "scheduled_time": {
                            "type": "string",
                            "description": "ISO 8601 timestamp for when to send the reminder (e.g., '2024-01-15T14:30:00'). Use this OR delay_minutes, not both.",
                        },
                        "recipient_phone": {
                            "type": "string",
                            "description": "Optional phone number to send SMS to. If not provided, reminder goes to the current conversation.",
                        },
                    },
                    "required": ["message"],
                },
                handler=self._handle_set_reminder,
            ),
            ToolDefinition(
                name="list_reminders",
                description="List all pending reminders.",
                parameters={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
                handler=self._handle_list_reminders,
            ),
            ToolDefinition(
                name="cancel_reminder",
                description="Cancel a pending reminder by its ID.",
                parameters={
                    "type": "object",
                    "properties": {
                        "reminder_id": {
                            "type": "string",
                            "description": "The ID of the reminder to cancel",
                        },
                    },
                    "required": ["reminder_id"],
                },
                handler=self._handle_cancel_reminder,
            ),
            ToolDefinition(
                name="get_calendar_events",
                description="Get calendar events from Google Calendar. Can get today's events, upcoming events, or events within a date range.",
                parameters={
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["today", "upcoming", "range"],
                            "description": "Type of query: 'today' for today's events, 'upcoming' for next 7 days, 'range' for custom date range.",
                        },
                        "days": {
                            "type": "number",
                            "description": "For 'upcoming' type: number of days to look ahead (default 7).",
                        },
                        "start_date": {
                            "type": "string",
                            "description": "For 'range' type: start date in ISO format (e.g., '2024-01-15').",
                        },
                        "end_date": {
                            "type": "string",
                            "description": "For 'range' type: end date in ISO format.",
                        },
                    },
                    "required": [],
                },
                handler=self._handle_get_calendar_events,
            ),
            ToolDefinition(
                name="get_today_events",
                description="Get all calendar events scheduled for today.",
                parameters={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
                handler=self._handle_get_today_events,
            ),
            ToolDefinition(
                name="get_upcoming_events",
                description="Get upcoming calendar events for a specified number of days.",
                parameters={
                    "type": "object",
                    "properties": {
                        "days": {
                            "type": "number",
                            "description": "Number of days to look ahead. Default is 7.",
                        },
                    },
                    "required": [],
                },
                handler=self._handle_get_upcoming_events,
            ),
            ToolDefinition(
                name="create_calendar_event",
                description="Create a new event on Google Calendar.",
                parameters={
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "The event title/summary",
                        },
                        "start_time": {
                            "type": "string",
                            "description": "Event start time in ISO format (e.g., '2024-01-15T14:00:00'). For all-day events, use date only (e.g., '2024-01-15').",
                        },
                        "end_time": {
                            "type": "string",
                            "description": "Event end time in ISO format. If not provided, defaults to 1 hour after start for timed events.",
                        },
                        "description": {
                            "type": "string",
                            "description": "Optional event description/notes.",
                        },
                        "location": {
                            "type": "string",
                            "description": "Optional event location.",
                        },
                        "all_day": {
                            "type": "boolean",
                            "description": "Whether this is an all-day event. Default is false.",
                        },
                    },
                    "required": ["title", "start_time"],
                },
                handler=self._handle_create_calendar_event,
            ),
            ToolDefinition(
                name="update_calendar_event",
                description="Update an existing calendar event by its ID.",
                parameters={
                    "type": "object",
                    "properties": {
                        "event_id": {
                            "type": "string",
                            "description": "The ID of the event to update (obtained from get_calendar_events).",
                        },
                        "title": {
                            "type": "string",
                            "description": "New event title/summary.",
                        },
                        "start_time": {
                            "type": "string",
                            "description": "New start time in ISO format.",
                        },
                        "end_time": {
                            "type": "string",
                            "description": "New end time in ISO format.",
                        },
                        "description": {
                            "type": "string",
                            "description": "New event description.",
                        },
                        "location": {
                            "type": "string",
                            "description": "New event location.",
                        },
                    },
                    "required": ["event_id"],
                },
                handler=self._handle_update_calendar_event,
            ),
            ToolDefinition(
                name="delete_calendar_event",
                description="Delete an event from Google Calendar by its ID.",
                parameters={
                    "type": "object",
                    "properties": {
                        "event_id": {
                            "type": "string",
                            "description": "The ID of the event to delete (obtained from get_calendar_events).",
                        },
                    },
                    "required": ["event_id"],
                },
                handler=self._handle_delete_calendar_event,
            ),
            ToolDefinition(
                name="add_grocery_item",
                description="Add an item to the shared grocery list. The grocery list is shared between Nate, Shakita, and ZEKE.",
                parameters={
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "The name of the grocery item to add",
                        },
                        "quantity": {
                            "type": "string",
                            "description": "The quantity (e.g., '1', '2 lbs', '1 dozen'). Default is '1'.",
                        },
                        "category": {
                            "type": "string",
                            "enum": ["Produce", "Dairy", "Meat", "Bakery", "Frozen", "Beverages", "Snacks", "Household", "Other"],
                            "description": "The category of the item. Default is 'Other'.",
                        },
                        "added_by": {
                            "type": "string",
                            "enum": ["Nate", "ZEKE", "Shakita"],
                            "description": "Who is adding this item. Use 'Nate' for items Nate requests, 'ZEKE' if you're adding it proactively, 'Shakita' if she requests it.",
                        },
                    },
                    "required": ["name"],
                },
                handler=self._handle_add_grocery_item,
            ),
            ToolDefinition(
                name="list_grocery_items",
                description="List all items on the grocery list, showing what needs to be bought and what's already purchased.",
                parameters={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
                handler=self._handle_list_grocery_items,
            ),
            ToolDefinition(
                name="mark_grocery_purchased",
                description="Mark a grocery item as purchased (or toggle back to unpurchased).",
                parameters={
                    "type": "object",
                    "properties": {
                        "item_name": {
                            "type": "string",
                            "description": "The name of the item to mark as purchased (partial match is supported).",
                        },
                    },
                    "required": ["item_name"],
                },
                handler=self._handle_mark_grocery_purchased,
            ),
            ToolDefinition(
                name="remove_grocery_item",
                description="Remove an item from the grocery list entirely.",
                parameters={
                    "type": "object",
                    "properties": {
                        "item_name": {
                            "type": "string",
                            "description": "The name of the item to remove (partial match is supported).",
                        },
                    },
                    "required": ["item_name"],
                },
                handler=self._handle_remove_grocery_item,
            ),
            ToolDefinition(
                name="clear_purchased_groceries",
                description="Clear all purchased items from the grocery list.",
                parameters={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
                handler=self._handle_clear_purchased_groceries,
            ),
            ToolDefinition(
                name="clear_all_groceries",
                description="Clear ALL items from the grocery list entirely. Use when user says 'clear the list', 'empty the list', 'start fresh', or 'got them all'.",
                parameters={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
                handler=self._handle_clear_all_groceries,
            ),
            ToolDefinition(
                name="get_current_time",
                description="Get the current date and time in the user's timezone (America/New_York).",
                parameters={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
                handler=self._handle_get_current_time,
            ),
            ToolDefinition(
                name="get_weather",
                description="Get current weather and optional forecast for a location. Defaults to Boston, MA where Nate lives.",
                parameters={
                    "type": "object",
                    "properties": {
                        "city": {
                            "type": "string",
                            "description": "City name. Default is 'Boston'.",
                        },
                        "country": {
                            "type": "string",
                            "description": "Country code. Default is 'US'.",
                        },
                        "include_forecast": {
                            "type": "boolean",
                            "description": "Whether to include multi-day forecast. Default is false.",
                        },
                        "forecast_days": {
                            "type": "number",
                            "description": "Number of days for forecast (1-5). Default is 5.",
                        },
                    },
                    "required": [],
                },
                handler=self._handle_get_weather,
            ),
        ]
        
        super().__init__(
            agent_id=AgentId.OPS_PLANNER,
            name="Operations Planner",
            description="ZEKE's scheduling and task management specialist. Handles tasks, reminders, calendar events, grocery lists, and provides time/weather utilities.",
            instructions=OPS_PLANNER_INSTRUCTIONS,
            capabilities=[
                CapabilityCategory.SCHEDULING,
                CapabilityCategory.TASK_MANAGEMENT,
                CapabilityCategory.GROCERY,
            ],
            tools=tool_definitions,
            handoff_targets=[
                AgentId.CONDUCTOR,
                AgentId.MEMORY_CURATOR,
            ],
        )
    
    async def add_task(
        self,
        title: str,
        description: str | None = None,
        priority: str = "medium",
        due_date: str | None = None,
        category: str = "personal"
    ) -> TaskResult:
        """
        Add a new task to the to-do list.
        
        Args:
            title: The task title/description
            description: Optional longer description
            priority: Task priority (low/medium/high)
            due_date: Due date in ISO 8601 format
            category: Task category (work/personal/family)
            
        Returns:
            TaskResult: Result of the add operation
        """
        try:
            args: dict[str, Any] = {"title": title, "priority": priority, "category": category}
            if description:
                args["description"] = description
            if due_date:
                args["due_date"] = due_date
            
            result = await self.bridge.execute_tool("add_task", args)
            
            if result.get("success"):
                return TaskResult(
                    success=True,
                    task=result.get("task"),
                    message=result.get("message", f"Added task: {title}"),
                )
            else:
                return TaskResult(
                    success=False,
                    error=result.get("error", "Unknown error"),
                )
        except Exception as e:
            logger.error(f"Failed to add task: {e}")
            return TaskResult(success=False, error=str(e))
    
    async def list_tasks(
        self,
        include_completed: bool = False,
        category: str | None = None,
        show_overdue: bool = False,
        show_due_today: bool = False
    ) -> list[dict[str, Any]]:
        """
        List tasks with optional filters.
        
        Args:
            include_completed: Whether to include completed tasks
            category: Filter by category
            show_overdue: Only show overdue tasks
            show_due_today: Only show tasks due today
            
        Returns:
            list: List of task dictionaries
        """
        try:
            args: dict[str, Any] = {"include_completed": include_completed}
            if category:
                args["category"] = category
            if show_overdue:
                args["show_overdue"] = show_overdue
            if show_due_today:
                args["show_due_today"] = show_due_today
            
            result = await self.bridge.execute_tool("list_tasks", args)
            return result.get("tasks", [])
        except Exception as e:
            logger.error(f"Failed to list tasks: {e}")
            return []
    
    async def get_today_summary(self) -> dict[str, Any]:
        """
        Get a summary of today's schedule including events and tasks due today.
        
        Returns:
            dict: Summary with events, tasks, and reminders
        """
        summary: dict[str, Any] = {
            "events": [],
            "tasks_due": [],
            "reminders": [],
        }
        
        try:
            events_result = await self.bridge.execute_tool("get_today_events", {})
            summary["events"] = events_result.get("events", [])
        except Exception as e:
            logger.warning(f"Failed to get today's events: {e}")
        
        try:
            tasks_result = await self.bridge.execute_tool("list_tasks", {"show_due_today": True})
            summary["tasks_due"] = tasks_result.get("tasks", [])
        except Exception as e:
            logger.warning(f"Failed to get today's tasks: {e}")
        
        try:
            reminders_result = await self.bridge.execute_tool("list_reminders", {})
            summary["reminders"] = reminders_result.get("reminders", [])
        except Exception as e:
            logger.warning(f"Failed to get reminders: {e}")
        
        return summary
    
    async def _execute(self, input_text: str, context: AgentContext) -> str:
        """
        Execute the Operations Planner agent's main logic.
        
        This method processes scheduling and task management requests,
        executing the appropriate tools via the Node.js bridge.
        
        Args:
            input_text: The user's input message
            context: Context for the request
            
        Returns:
            str: The agent's response
        """
        self.status = AgentStatus.PROCESSING
        
        try:
            full_instructions = self.instructions
            
            if context.user_profile:
                full_instructions += f"\n\nUser Profile Context:\n{json.dumps(context.user_profile, indent=2)}"
            
            if context.metadata.get("source"):
                full_instructions += f"\n\nRequest Source: {context.metadata.get('source')}"
            if context.phone_number:
                full_instructions += f"\nSender Phone: {context.phone_number}"
            
            from agents import Agent, Runner
            
            agent = Agent(
                name=self.name,
                instructions=full_instructions,
                tools=self.tools,
            )
            
            result = await Runner.run(agent, input_text)
            
            self.status = AgentStatus.IDLE
            return result.final_output
            
        except Exception as e:
            self.status = AgentStatus.ERROR
            logger.error(f"OpsPlannerAgent execution error: {e}")
            raise


_ops_planner_instance: OpsPlannerAgent | None = None


def get_ops_planner() -> OpsPlannerAgent:
    """
    Get the singleton Operations Planner agent instance.
    
    Returns:
        OpsPlannerAgent: The Operations Planner agent instance
    """
    global _ops_planner_instance
    if _ops_planner_instance is None:
        _ops_planner_instance = OpsPlannerAgent()
    return _ops_planner_instance
