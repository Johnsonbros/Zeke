import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import {
  createTask,
  getAllTasks,
  getTask,
  updateTask,
  toggleTaskCompleted,
  deleteTask,
  clearCompletedTasks,
  getTasksDueToday,
  getOverdueTasks,
} from "../db";
import type { Task } from "@shared/schema";

export const taskToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "add_task",
      description: "Add a task to the to-do list. Use for any task, to-do item, or action item Nate mentions.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The task title/description",
          },
          description: {
            type: "string",
            description: "Optional longer description or notes for the task",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Task priority. Default is 'medium'.",
          },
          due_date: {
            type: "string",
            description: "Due date in ISO 8601 format (e.g., '2024-01-15' or '2024-01-15T14:30:00'). Optional.",
          },
          category: {
            type: "string",
            enum: ["work", "personal", "family"],
            description: "Task category. Default is 'personal'.",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tasks",
      description: "List all tasks, optionally filtered by category or status. Shows pending tasks by default.",
      parameters: {
        type: "object",
        properties: {
          include_completed: {
            type: "boolean",
            description: "Whether to include completed tasks. Default is false.",
          },
          category: {
            type: "string",
            enum: ["work", "personal", "family"],
            description: "Filter by category. If not provided, shows all categories.",
          },
          show_overdue: {
            type: "boolean",
            description: "Only show overdue tasks.",
          },
          show_due_today: {
            type: "boolean",
            description: "Only show tasks due today.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Update an existing task by ID or partial title match.",
      parameters: {
        type: "object",
        properties: {
          task_identifier: {
            type: "string",
            description: "The task ID or partial title to find the task",
          },
          title: {
            type: "string",
            description: "New title for the task",
          },
          description: {
            type: "string",
            description: "New description for the task",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "New priority level",
          },
          due_date: {
            type: "string",
            description: "New due date in ISO 8601 format, or null to remove",
          },
          category: {
            type: "string",
            enum: ["work", "personal", "family"],
            description: "New category",
          },
        },
        required: ["task_identifier"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark a task as completed (or toggle back to incomplete).",
      parameters: {
        type: "object",
        properties: {
          task_identifier: {
            type: "string",
            description: "The task ID or partial title to find and complete the task",
          },
        },
        required: ["task_identifier"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description: "Delete a task from the to-do list.",
      parameters: {
        type: "object",
        properties: {
          task_identifier: {
            type: "string",
            description: "The task ID or partial title to find and delete the task",
          },
        },
        required: ["task_identifier"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_completed_tasks",
      description: "Remove all completed tasks from the list.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

export const taskToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  add_task: (p) => p.canAccessTasks,
  list_tasks: (p) => p.canAccessTasks,
  update_task: (p) => p.canAccessTasks,
  toggle_task: (p) => p.canAccessTasks,
  delete_task: (p) => p.canAccessTasks,
  clear_completed_tasks: (p) => p.canAccessTasks,
};

export async function executeTaskTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  switch (toolName) {
    case "add_task": {
      const { title, description, priority, due_date, category } = args as {
        title: string;
        description?: string;
        priority?: "low" | "medium" | "high";
        due_date?: string;
        category?: "work" | "personal" | "family";
      };
      
      try {
        const task = createTask({
          title,
          description: description || "",
          priority: priority || "medium",
          dueDate: due_date || null,
          category: category || "personal",
        });
        
        let message = `Added task: "${title}"`;
        if (due_date) {
          const dueStr = new Date(due_date).toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            timeZone: "America/New_York",
          });
          message += ` (due ${dueStr})`;
        }
        
        return JSON.stringify({
          success: true,
          message,
          task: {
            id: task.id,
            title: task.title,
            priority: task.priority,
            category: task.category,
            dueDate: task.dueDate,
          },
        });
      } catch (error) {
        console.error("Failed to add task:", error);
        return JSON.stringify({ success: false, error: "Failed to add task" });
      }
    }
    
    case "list_tasks": {
      const { include_completed, category, show_overdue, show_due_today } = args as {
        include_completed?: boolean;
        category?: "work" | "personal" | "family";
        show_overdue?: boolean;
        show_due_today?: boolean;
      };
      
      try {
        let tasks: Task[];
        
        if (show_overdue) {
          tasks = getOverdueTasks();
        } else if (show_due_today) {
          tasks = getTasksDueToday();
        } else if (category) {
          tasks = getAllTasks(include_completed || false).filter(t => t.category === category);
        } else {
          tasks = getAllTasks(include_completed || false);
        }
        
        if (tasks.length === 0) {
          let message = "No tasks found";
          if (show_overdue) message = "No overdue tasks";
          else if (show_due_today) message = "No tasks due today";
          else if (category) message = `No ${category} tasks`;
          
          return JSON.stringify({ tasks: [], message });
        }
        
        const pending = tasks.filter(t => !t.completed);
        const completed = tasks.filter(t => t.completed);
        
        const formatTask = (t: Task) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          category: t.category,
          dueDate: t.dueDate,
          completed: t.completed,
        });
        
        return JSON.stringify({
          pending: pending.map(formatTask),
          completed: include_completed ? completed.map(formatTask) : undefined,
          summary: `${pending.length} pending task(s)${include_completed ? `, ${completed.length} completed` : ""}`,
        });
      } catch (error) {
        console.error("Failed to list tasks:", error);
        return JSON.stringify({ error: "Failed to list tasks" });
      }
    }
    
    case "update_task": {
      const { task_identifier, title, description, priority, due_date, category } = args as {
        task_identifier: string;
        title?: string;
        description?: string;
        priority?: "low" | "medium" | "high";
        due_date?: string | null;
        category?: "work" | "personal" | "family";
      };
      
      try {
        let task = getTask(task_identifier);
        if (!task) {
          const allTasks = getAllTasks(true);
          const searchLower = task_identifier.toLowerCase();
          task = allTasks.find(t => t.title.toLowerCase().includes(searchLower));
        }
        
        if (!task) {
          return JSON.stringify({
            success: false,
            error: `No task matching "${task_identifier}" found`,
          });
        }
        
        const updated = updateTask(task.id, {
          title,
          description,
          priority,
          dueDate: due_date,
          category,
        });
        
        if (updated) {
          return JSON.stringify({
            success: true,
            message: `Updated task: "${updated.title}"`,
            task: {
              id: updated.id,
              title: updated.title,
              priority: updated.priority,
              category: updated.category,
              dueDate: updated.dueDate,
            },
          });
        }
        
        return JSON.stringify({ success: false, error: "Failed to update task" });
      } catch (error) {
        console.error("Failed to update task:", error);
        return JSON.stringify({ success: false, error: "Failed to update task" });
      }
    }
    
    case "complete_task": {
      const { task_identifier } = args as { task_identifier: string };
      
      try {
        let task = getTask(task_identifier);
        if (!task) {
          const allTasks = getAllTasks(true);
          const searchLower = task_identifier.toLowerCase();
          task = allTasks.find(t => t.title.toLowerCase().includes(searchLower));
        }
        
        if (!task) {
          return JSON.stringify({
            success: false,
            error: `No task matching "${task_identifier}" found`,
          });
        }
        
        const updated = toggleTaskCompleted(task.id);
        if (updated) {
          return JSON.stringify({
            success: true,
            message: updated.completed 
              ? `Completed task: "${updated.title}"` 
              : `Marked "${updated.title}" as not completed`,
            task: {
              id: updated.id,
              title: updated.title,
              completed: updated.completed,
            },
          });
        }
        
        return JSON.stringify({ success: false, error: "Failed to update task" });
      } catch (error) {
        console.error("Failed to complete task:", error);
        return JSON.stringify({ success: false, error: "Failed to complete task" });
      }
    }
    
    case "delete_task": {
      const { task_identifier } = args as { task_identifier: string };
      
      try {
        let task = getTask(task_identifier);
        if (!task) {
          const allTasks = getAllTasks(true);
          const searchLower = task_identifier.toLowerCase();
          task = allTasks.find(t => t.title.toLowerCase().includes(searchLower));
        }
        
        if (!task) {
          return JSON.stringify({
            success: false,
            error: `No task matching "${task_identifier}" found`,
          });
        }
        
        const deleted = deleteTask(task.id);
        if (deleted) {
          return JSON.stringify({
            success: true,
            message: `Deleted task: "${task.title}"`,
          });
        }
        
        return JSON.stringify({ success: false, error: "Failed to delete task" });
      } catch (error) {
        console.error("Failed to delete task:", error);
        return JSON.stringify({ success: false, error: "Failed to delete task" });
      }
    }
    
    case "clear_completed_tasks": {
      try {
        const count = clearCompletedTasks();
        return JSON.stringify({
          success: true,
          message: count > 0
            ? `Cleared ${count} completed task(s)`
            : "No completed tasks to clear",
          tasks_cleared: count,
        });
      } catch (error) {
        console.error("Failed to clear completed tasks:", error);
        return JSON.stringify({ success: false, error: "Failed to clear completed tasks" });
      }
    }
    
    default:
      return null;
  }
}

export const taskToolNames = [
  "add_task",
  "list_tasks",
  "update_task",
  "complete_task",
  "delete_task",
  "clear_completed_tasks",
];
