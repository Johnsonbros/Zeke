/**
 * Task Capability Tests
 *
 * Tests the task tool definitions and execution functions for
 * creating, listing, updating, and managing tasks and subtasks.
 *
 * Run with: npx vitest server/__tests__/capabilities/tasks.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database functions - must be before imports
vi.mock("../../db", () => ({
  createTask: vi.fn(),
  getAllTasks: vi.fn(),
  getTask: vi.fn(),
  updateTask: vi.fn(),
  toggleTaskCompleted: vi.fn(),
  deleteTask: vi.fn(),
  clearCompletedTasks: vi.fn(),
  getTasksDueToday: vi.fn(),
  getOverdueTasks: vi.fn(),
  getSubtasks: vi.fn(),
  getTaskWithSubtasks: vi.fn(),
}));

// Mock workflow functions - must fully mock the module including OpenAI client creation
vi.mock("../../capabilities/workflows", () => ({
  analyzeAndBreakdownTask: vi.fn(),
  calculateSubtaskDueDate: vi.fn(),
}));

// Mock entity extractor
vi.mock("../../entityExtractor", () => ({
  onTaskCreated: vi.fn().mockResolvedValue(undefined),
}));

// Mock feedback learning
vi.mock("../../feedbackLearning", () => ({
  trackAction: vi.fn(),
  recordActionOutcome: vi.fn(),
}));

// Mock @shared/schema
vi.mock("@shared/schema", () => ({
  Task: {},
}));

import {
  taskToolDefinitions,
  taskToolPermissions,
  executeTaskTool,
  taskToolNames,
} from "../../capabilities/tasks";
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
  getSubtasks,
  getTaskWithSubtasks,
} from "../../db";
import { analyzeAndBreakdownTask, calculateSubtaskDueDate } from "../../capabilities/workflows";
import { trackAction, recordActionOutcome } from "../../feedbackLearning";

describe("Task Capability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Tool Definitions", () => {
    it("should define all expected task tools", () => {
      const toolNames = taskToolDefinitions.map((t) => t.function.name);

      expect(toolNames).toContain("add_task");
      expect(toolNames).toContain("list_tasks");
      expect(toolNames).toContain("update_task");
      expect(toolNames).toContain("complete_task");
      expect(toolNames).toContain("delete_task");
      expect(toolNames).toContain("clear_completed_tasks");
      expect(toolNames).toContain("breakdown_task");
      expect(toolNames).toContain("list_subtasks");
      expect(toolNames).toContain("get_task_with_subtasks");
    });

    it("should have required parameters defined for add_task", () => {
      const addTool = taskToolDefinitions.find(
        (t) => t.function.name === "add_task"
      );

      expect(addTool).toBeDefined();
      expect(addTool?.function.parameters.required).toContain("title");
    });

    it("should define priority enum correctly", () => {
      const addTool = taskToolDefinitions.find(
        (t) => t.function.name === "add_task"
      );

      const priorityParam = (addTool?.function.parameters.properties as any)?.priority;
      expect(priorityParam?.enum).toEqual(["low", "medium", "high"]);
    });

    it("should export consistent tool names array", () => {
      const definedNames = taskToolDefinitions.map((t) => t.function.name);
      expect(taskToolNames).toEqual(definedNames);
    });
  });

  describe("Tool Permissions", () => {
    it("should require task access for all task tools", () => {
      const withAccess = { canAccessTasks: true };
      const withoutAccess = { canAccessTasks: false };

      for (const toolName of taskToolNames) {
        expect(taskToolPermissions[toolName](withAccess as any)).toBe(true);
        expect(taskToolPermissions[toolName](withoutAccess as any)).toBe(false);
      }
    });
  });

  describe("executeTaskTool", () => {
    describe("add_task", () => {
      it("should add a new task successfully", async () => {
        const mockTask = {
          id: "task-123",
          title: "Buy groceries",
          description: "",
          priority: "medium",
          category: "personal",
          dueDate: null,
          completed: false,
          createdAt: new Date().toISOString(),
        };
        vi.mocked(createTask).mockReturnValue(mockTask);

        const result = await executeTaskTool("add_task", {
          title: "Buy groceries",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.task.title).toBe("Buy groceries");
        expect(trackAction).toHaveBeenCalled();
      });

      it("should use default values when optional params not provided", async () => {
        const mockTask = {
          id: "task-123",
          title: "Test task",
          description: "",
          priority: "medium",
          category: "personal",
          dueDate: null,
          completed: false,
          createdAt: new Date().toISOString(),
        };
        vi.mocked(createTask).mockReturnValue(mockTask);

        await executeTaskTool("add_task", { title: "Test task" });

        expect(createTask).toHaveBeenCalledWith({
          title: "Test task",
          description: "",
          priority: "medium",
          dueDate: null,
          category: "personal",
        });
      });

      it("should auto-set high priority for urgent keywords", async () => {
        const mockTask = {
          id: "task-123",
          title: "URGENT: Call doctor",
          description: "",
          priority: "high",
          category: "personal",
          dueDate: null,
          completed: false,
          createdAt: new Date().toISOString(),
        };
        vi.mocked(createTask).mockReturnValue(mockTask);

        const result = await executeTaskTool("add_task", {
          title: "URGENT: Call doctor",
        });

        expect(createTask).toHaveBeenCalledWith(
          expect.objectContaining({ priority: "high" })
        );
        const parsed = JSON.parse(result!);
        expect(parsed.message).toContain("Urgency keywords detected");
      });

      it("should auto-set high priority for tasks due within 3 days", async () => {
        const threeDaysFromNow = new Date();
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 2);

        const mockTask = {
          id: "task-123",
          title: "Submit report",
          description: "",
          priority: "high",
          category: "work",
          dueDate: threeDaysFromNow.toISOString(),
          completed: false,
          createdAt: new Date().toISOString(),
        };
        vi.mocked(createTask).mockReturnValue(mockTask);

        const result = await executeTaskTool("add_task", {
          title: "Submit report",
          due_date: threeDaysFromNow.toISOString(),
        });

        expect(createTask).toHaveBeenCalledWith(
          expect.objectContaining({ priority: "high" })
        );
        const parsed = JSON.parse(result!);
        expect(parsed.message).toContain("Due within 3 days");
      });

      it("should auto-set low priority for tasks due far in the future", async () => {
        const twoWeeksFromNow = new Date();
        twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);

        const mockTask = {
          id: "task-123",
          title: "Plan vacation",
          description: "",
          priority: "low",
          category: "personal",
          dueDate: twoWeeksFromNow.toISOString(),
          completed: false,
          createdAt: new Date().toISOString(),
        };
        vi.mocked(createTask).mockReturnValue(mockTask);

        await executeTaskTool("add_task", {
          title: "Plan vacation",
          due_date: twoWeeksFromNow.toISOString(),
        });

        expect(createTask).toHaveBeenCalledWith(
          expect.objectContaining({ priority: "low" })
        );
      });

      it("should respect explicitly provided priority over auto-suggestion", async () => {
        const mockTask = {
          id: "task-123",
          title: "URGENT task",
          description: "",
          priority: "low",
          category: "personal",
          dueDate: null,
          completed: false,
          createdAt: new Date().toISOString(),
        };
        vi.mocked(createTask).mockReturnValue(mockTask);

        await executeTaskTool("add_task", {
          title: "URGENT task",
          priority: "low", // Explicitly set to low despite urgent keyword
        });

        expect(createTask).toHaveBeenCalledWith(
          expect.objectContaining({ priority: "low" })
        );
      });
    });

    describe("list_tasks", () => {
      it("should list pending tasks by default", async () => {
        vi.mocked(getAllTasks).mockReturnValue([
          { id: "1", title: "Task 1", completed: false, priority: "high", category: "work", dueDate: null },
          { id: "2", title: "Task 2", completed: false, priority: "medium", category: "personal", dueDate: null },
          { id: "3", title: "Task 3", completed: true, priority: "low", category: "family", dueDate: null },
        ] as any);

        const result = await executeTaskTool("list_tasks", {});

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.pending).toHaveLength(2);
        expect(parsed.completed).toBeUndefined();
        expect(getAllTasks).toHaveBeenCalledWith(false);
      });

      it("should include completed tasks when requested", async () => {
        vi.mocked(getAllTasks).mockReturnValue([
          { id: "1", title: "Task 1", completed: false, priority: "high", category: "work", dueDate: null },
          { id: "2", title: "Task 2", completed: true, priority: "medium", category: "personal", dueDate: null },
        ] as any);

        const result = await executeTaskTool("list_tasks", {
          include_completed: true,
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.pending).toHaveLength(1);
        expect(parsed.completed).toHaveLength(1);
        expect(getAllTasks).toHaveBeenCalledWith(true);
      });

      it("should filter by category", async () => {
        vi.mocked(getAllTasks).mockReturnValue([
          { id: "1", title: "Work Task", completed: false, priority: "high", category: "work", dueDate: null },
          { id: "2", title: "Personal Task", completed: false, priority: "medium", category: "personal", dueDate: null },
        ] as any);

        const result = await executeTaskTool("list_tasks", {
          category: "work",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.pending).toHaveLength(1);
        expect(parsed.pending[0].category).toBe("work");
      });

      it("should show overdue tasks when requested", async () => {
        vi.mocked(getOverdueTasks).mockReturnValue([
          { id: "1", title: "Overdue Task", completed: false, priority: "high", category: "work", dueDate: "2024-01-01" },
        ] as any);

        const result = await executeTaskTool("list_tasks", {
          show_overdue: true,
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.pending).toHaveLength(1);
        expect(getOverdueTasks).toHaveBeenCalled();
      });

      it("should show tasks due today when requested", async () => {
        vi.mocked(getTasksDueToday).mockReturnValue([
          { id: "1", title: "Due Today", completed: false, priority: "high", category: "work", dueDate: new Date().toISOString() },
        ] as any);

        const result = await executeTaskTool("list_tasks", {
          show_due_today: true,
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.pending).toHaveLength(1);
        expect(getTasksDueToday).toHaveBeenCalled();
      });

      it("should return appropriate message when no tasks found", async () => {
        vi.mocked(getAllTasks).mockReturnValue([]);

        const result = await executeTaskTool("list_tasks", {});

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.message).toBe("No tasks found");
        expect(parsed.tasks).toEqual([]);
      });
    });

    describe("update_task", () => {
      it("should update task by ID", async () => {
        vi.mocked(getTask).mockReturnValue({
          id: "task-123",
          title: "Old Title",
          description: "",
          priority: "medium",
          category: "personal",
          dueDate: null,
          completed: false,
        } as any);
        vi.mocked(updateTask).mockReturnValue({
          id: "task-123",
          title: "New Title",
          description: "",
          priority: "high",
          category: "work",
          dueDate: null,
          completed: false,
        } as any);

        const result = await executeTaskTool("update_task", {
          task_identifier: "task-123",
          title: "New Title",
          priority: "high",
          category: "work",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.task.title).toBe("New Title");
        expect(recordActionOutcome).toHaveBeenCalledWith(
          "task-123",
          "modified",
          expect.any(String)
        );
      });

      it("should find task by partial title match", async () => {
        vi.mocked(getTask).mockReturnValue(null);
        vi.mocked(getAllTasks).mockReturnValue([
          { id: "1", title: "Buy groceries from store", completed: false },
          { id: "2", title: "Clean house", completed: false },
        ] as any);
        vi.mocked(updateTask).mockReturnValue({
          id: "1",
          title: "Buy groceries from store",
          priority: "high",
        } as any);

        const result = await executeTaskTool("update_task", {
          task_identifier: "groceries",
          priority: "high",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(updateTask).toHaveBeenCalledWith("1", expect.any(Object));
      });

      it("should return error when task not found", async () => {
        vi.mocked(getTask).mockReturnValue(null);
        vi.mocked(getAllTasks).mockReturnValue([]);

        const result = await executeTaskTool("update_task", {
          task_identifier: "nonexistent",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain("No task matching");
      });
    });

    describe("complete_task", () => {
      it("should mark task as completed", async () => {
        vi.mocked(getTask).mockReturnValue({
          id: "task-123",
          title: "Test Task",
          completed: false,
        } as any);
        vi.mocked(toggleTaskCompleted).mockReturnValue({
          id: "task-123",
          title: "Test Task",
          completed: true,
        } as any);

        const result = await executeTaskTool("complete_task", {
          task_identifier: "task-123",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.task.completed).toBe(true);
        expect(parsed.message).toContain("Completed task");
        expect(recordActionOutcome).toHaveBeenCalledWith("task-123", "completed");
      });

      it("should toggle task back to incomplete", async () => {
        vi.mocked(getTask).mockReturnValue({
          id: "task-123",
          title: "Test Task",
          completed: true,
        } as any);
        vi.mocked(toggleTaskCompleted).mockReturnValue({
          id: "task-123",
          title: "Test Task",
          completed: false,
        } as any);

        const result = await executeTaskTool("complete_task", {
          task_identifier: "task-123",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.task.completed).toBe(false);
        expect(parsed.message).toContain("not completed");
      });
    });

    describe("delete_task", () => {
      it("should delete task successfully", async () => {
        vi.mocked(getTask).mockReturnValue({
          id: "task-123",
          title: "Task to Delete",
        } as any);
        vi.mocked(deleteTask).mockReturnValue(true);

        const result = await executeTaskTool("delete_task", {
          task_identifier: "task-123",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.message).toContain("Deleted task");
        expect(recordActionOutcome).toHaveBeenCalledWith("task-123", "deleted");
      });

      it("should return error when task not found", async () => {
        vi.mocked(getTask).mockReturnValue(null);
        vi.mocked(getAllTasks).mockReturnValue([]);

        const result = await executeTaskTool("delete_task", {
          task_identifier: "nonexistent",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain("No task matching");
      });
    });

    describe("clear_completed_tasks", () => {
      it("should clear completed tasks", async () => {
        vi.mocked(clearCompletedTasks).mockReturnValue(5);

        const result = await executeTaskTool("clear_completed_tasks", {});

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.tasks_cleared).toBe(5);
        expect(parsed.message).toContain("5 completed task(s)");
      });

      it("should handle no tasks to clear", async () => {
        vi.mocked(clearCompletedTasks).mockReturnValue(0);

        const result = await executeTaskTool("clear_completed_tasks", {});

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.tasks_cleared).toBe(0);
        expect(parsed.message).toBe("No completed tasks to clear");
      });
    });

    describe("breakdown_task", () => {
      it("should break down a complex task into subtasks", async () => {
        vi.mocked(getTask).mockReturnValue({
          id: "task-123",
          title: "Plan birthday party",
          dueDate: "2024-06-15",
          category: "personal",
        } as any);
        vi.mocked(getSubtasks).mockReturnValue([]);
        vi.mocked(analyzeAndBreakdownTask).mockResolvedValue({
          shouldBreakdown: true,
          reason: "Complex task with multiple steps",
          subtasks: [
            { title: "Create guest list", description: "", priority: "high", relativeDueDays: -7 },
            { title: "Book venue", description: "", priority: "high", relativeDueDays: -5 },
            { title: "Order cake", description: "", priority: "medium", relativeDueDays: -3 },
          ],
        });
        vi.mocked(calculateSubtaskDueDate).mockReturnValue("2024-06-08");
        vi.mocked(createTask).mockImplementation((data: any) => ({
          id: `subtask-${Math.random()}`,
          ...data,
        }));

        const result = await executeTaskTool("breakdown_task", {
          task_identifier: "task-123",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.breakdown_created).toBe(true);
        expect(parsed.subtasks).toHaveLength(3);
      });

      it("should not break down simple tasks", async () => {
        vi.mocked(getTask).mockReturnValue({
          id: "task-123",
          title: "Buy milk",
        } as any);
        vi.mocked(getSubtasks).mockReturnValue([]);
        vi.mocked(analyzeAndBreakdownTask).mockResolvedValue({
          shouldBreakdown: false,
          reason: "Task is simple and atomic",
          subtasks: [],
        });

        const result = await executeTaskTool("breakdown_task", {
          task_identifier: "task-123",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.breakdown_created).toBe(false);
        expect(parsed.message).toContain("doesn't need to be broken down");
      });

      it("should not re-breakdown task with existing subtasks", async () => {
        vi.mocked(getTask).mockReturnValue({
          id: "task-123",
          title: "Plan vacation",
        } as any);
        vi.mocked(getSubtasks).mockReturnValue([
          { id: "sub-1", title: "Book flights", completed: false },
        ] as any);

        const result = await executeTaskTool("breakdown_task", {
          task_identifier: "task-123",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain("already has");
        expect(parsed.existing_subtasks).toHaveLength(1);
      });
    });

    describe("list_subtasks", () => {
      it("should list subtasks for a parent task", async () => {
        vi.mocked(getTask).mockReturnValue({
          id: "task-123",
          title: "Plan vacation",
          completed: false,
        } as any);
        vi.mocked(getSubtasks).mockReturnValue([
          { id: "sub-1", title: "Book flights", priority: "high", dueDate: null, completed: true },
          { id: "sub-2", title: "Reserve hotel", priority: "medium", dueDate: null, completed: false },
        ] as any);

        const result = await executeTaskTool("list_subtasks", {
          task_identifier: "task-123",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.subtasks).toHaveLength(2);
        expect(parsed.summary).toBe("1 pending, 1 completed");
      });

      it("should handle task with no subtasks", async () => {
        vi.mocked(getTask).mockReturnValue({
          id: "task-123",
          title: "Simple task",
        } as any);
        vi.mocked(getSubtasks).mockReturnValue([]);

        const result = await executeTaskTool("list_subtasks", {
          task_identifier: "task-123",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.subtasks).toEqual([]);
        expect(parsed.message).toContain("has no subtasks");
      });
    });

    describe("get_task_with_subtasks", () => {
      it("should return task with all subtasks", async () => {
        vi.mocked(getTask).mockReturnValue({
          id: "task-123",
          title: "Parent Task",
        } as any);
        vi.mocked(getTaskWithSubtasks).mockReturnValue({
          id: "task-123",
          title: "Parent Task",
          description: "A complex task",
          priority: "high",
          category: "work",
          dueDate: "2024-06-15",
          completed: false,
          subtasks: [
            { id: "sub-1", title: "Subtask 1", completed: true },
            { id: "sub-2", title: "Subtask 2", completed: false },
          ],
        } as any);

        const result = await executeTaskTool("get_task_with_subtasks", {
          task_identifier: "task-123",
        });

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.success).toBe(true);
        expect(parsed.task.subtasks).toHaveLength(2);
        expect(parsed.subtask_count).toBe(2);
        expect(parsed.completed_subtasks).toBe(1);
      });
    });

    describe("unknown tool", () => {
      it("should return null for unknown tool names", async () => {
        const result = await executeTaskTool("unknown_tool", {});
        expect(result).toBeNull();
      });
    });

    describe("error handling", () => {
      it("should handle database errors gracefully", async () => {
        vi.mocked(getAllTasks).mockImplementation(() => {
          throw new Error("Database error");
        });

        const result = await executeTaskTool("list_tasks", {});

        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.error).toBeDefined();
      });
    });
  });
});
