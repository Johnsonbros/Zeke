import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Trash2, 
  ListTodo,
  ArrowLeft,
  Check,
  Calendar,
  AlertCircle,
  Briefcase,
  User,
  Users,
  ChevronDown
} from "lucide-react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
} from "@/components/ui/form";
import type { Task } from "@shared/schema";
import { format, isPast, isToday, parseISO } from "date-fns";

const PRIORITIES = ["low", "medium", "high"] as const;
const CATEGORIES = ["work", "personal", "family"] as const;

const taskFormSchema = z.object({
  title: z.string().min(1, "Task title is required"),
  priority: z.enum(PRIORITIES).default("medium"),
  category: z.enum(CATEGORIES).default("personal"),
  dueDate: z.string().optional(),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

function getPriorityColor(priority: string) {
  switch (priority) {
    case "high": return "text-red-500";
    case "medium": return "text-yellow-500";
    case "low": return "text-green-500";
    default: return "text-muted-foreground";
  }
}

function getCategoryIcon(category: string) {
  switch (category) {
    case "work": return <Briefcase className="h-3 w-3" />;
    case "personal": return <User className="h-3 w-3" />;
    case "family": return <Users className="h-3 w-3" />;
    default: return null;
  }
}

function TaskItemRow({ 
  task, 
  onToggle,
  onDelete,
  isDeleting
}: { 
  task: Task; 
  onToggle: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const isOverdue = task.dueDate && !task.completed && isPast(parseISO(task.dueDate)) && !isToday(parseISO(task.dueDate));
  const isDueToday = task.dueDate && isToday(parseISO(task.dueDate));
  
  return (
    <div 
      className={`group flex items-center gap-3 px-3 md:px-4 py-3 rounded-lg border border-border hover-elevate transition-all ${
        task.completed ? "opacity-60" : ""
      } ${isOverdue ? "border-red-500/50" : ""}`}
      data-testid={`task-item-${task.id}`}
    >
      <Checkbox
        checked={task.completed}
        onCheckedChange={onToggle}
        className="h-5 w-5"
        data-testid={`checkbox-task-${task.id}`}
      />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span 
            className={`text-sm font-medium ${task.completed ? "line-through text-muted-foreground" : ""}`}
            data-testid={`text-task-title-${task.id}`}
          >
            {task.title}
          </span>
          <Badge 
            variant="outline" 
            className={`text-xs ${getPriorityColor(task.priority)}`}
          >
            {task.priority}
          </Badge>
          <Badge variant="secondary" className="text-xs gap-1">
            {getCategoryIcon(task.category)}
            {task.category}
          </Badge>
        </div>
        {task.dueDate && (
          <div className={`flex items-center gap-1 mt-1 text-xs ${
            isOverdue ? "text-red-500" : isDueToday ? "text-yellow-500" : "text-muted-foreground"
          }`}>
            {isOverdue && <AlertCircle className="h-3 w-3" />}
            <Calendar className="h-3 w-3" />
            <span>
              {isOverdue ? "Overdue: " : isDueToday ? "Due today: " : "Due: "}
              {format(parseISO(task.dueDate), "MMM d, yyyy")}
            </span>
          </div>
        )}
      </div>
      
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onDelete}
        disabled={isDeleting}
        data-testid={`button-delete-task-${task.id}`}
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
}

function TaskListSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-16 rounded-lg" />
      ))}
    </div>
  );
}

type FilterType = "all" | "work" | "personal" | "family" | "overdue" | "today";

export default function TasksPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterType>("all");
  const [showCompleted, setShowCompleted] = useState(false);
  
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      priority: "medium",
      category: "personal",
      dueDate: "",
    },
  });

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (showCompleted) params.set("includeCompleted", "true");
    if (filter === "overdue") params.set("overdue", "true");
    else if (filter === "today") params.set("dueToday", "true");
    else if (filter !== "all") params.set("category", filter);
    return params.toString() ? `?${params.toString()}` : "";
  };

  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", filter, showCompleted],
    queryFn: async () => {
      const response = await fetch(`/api/tasks${buildQueryString()}`);
      if (!response.ok) throw new Error("Failed to fetch tasks");
      return response.json();
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: async (data: TaskFormValues) => {
      const response = await apiRequest("POST", "/api/tasks", {
        title: data.title,
        priority: data.priority,
        category: data.category,
        dueDate: data.dueDate || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      form.reset({ title: "", priority: "medium", category: form.getValues("category"), dueDate: "" });
      toast({
        title: "Task added",
        description: "Added to your task list",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/tasks/${id}/toggle`);
      return response.json();
    },
    onSuccess: (data: Task) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: data.completed ? "Task completed" : "Task reopened",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/tasks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task removed",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearCompletedMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/tasks/clear-completed");
      return response.json();
    },
    onSuccess: (data: { deleted: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Cleared completed tasks",
        description: `Removed ${data.deleted} task${data.deleted !== 1 ? "s" : ""}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to clear tasks",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TaskFormValues) => {
    addTaskMutation.mutate(data);
  };

  const pendingTasks = tasks?.filter(t => !t.completed) || [];
  const completedTasks = tasks?.filter(t => t.completed) || [];
  const totalTasks = tasks?.length || 0;

  return (
    <div className="flex flex-col h-screen h-[100dvh] bg-background" data-testid="tasks-page">
      <header className="h-14 md:h-16 border-b border-border flex items-center justify-between gap-3 px-3 md:px-6 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button size="icon" variant="ghost" data-testid="button-back-to-chat">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-primary" />
            <h1 className="text-lg md:text-xl font-semibold" data-testid="text-page-title">Tasks</h1>
          </div>
        </div>
        
        {completedTasks.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearCompletedMutation.mutate()}
            disabled={clearCompletedMutation.isPending}
            className="gap-1.5"
            data-testid="button-clear-completed"
          >
            <Check className="h-4 w-4" />
            Clear {completedTasks.length}
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-hidden flex flex-col max-w-2xl mx-auto w-full">
        <div className="p-3 md:p-4 border-b border-border shrink-0">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Add a task..."
                        className="h-11"
                        disabled={addTaskMutation.isPending}
                        data-testid="input-new-task"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <div className="flex gap-2 flex-wrap">
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-[110px] h-9" data-testid="select-priority">
                            <SelectValue placeholder="Priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PRIORITIES.map((p) => (
                            <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-[120px] h-9" data-testid="select-category">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem className="flex-1 min-w-[140px]">
                      <FormControl>
                        <Input
                          {...field}
                          type="date"
                          className="h-9"
                          disabled={addTaskMutation.isPending}
                          data-testid="input-due-date"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                
                <Button
                  type="submit"
                  disabled={addTaskMutation.isPending}
                  className="gap-1.5 h-9"
                  data-testid="button-add-task"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </form>
          </Form>
        </div>

        <div className="p-3 md:p-4 border-b border-border shrink-0">
          <div className="flex gap-2 flex-wrap">
            {(["all", "work", "personal", "family", "overdue", "today"] as FilterType[]).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => setFilter(f)}
                className="capitalize h-8"
                data-testid={`filter-${f}`}
              >
                {f === "all" ? "All" : f === "overdue" ? "Overdue" : f === "today" ? "Due Today" : f}
              </Button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3 md:p-4 space-y-4">
            {isLoading ? (
              <TaskListSkeleton />
            ) : totalTasks === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <ListTodo className="h-7 w-7 text-primary" />
                </div>
                <h2 className="text-lg font-medium mb-1" data-testid="text-empty-state">No tasks</h2>
                <p className="text-sm text-muted-foreground">Add tasks above or ask ZEKE to help you manage them</p>
              </div>
            ) : (
              <>
                {pendingTasks.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-sm font-medium text-muted-foreground px-1">
                      To Do ({pendingTasks.length})
                    </h2>
                    {pendingTasks.map((task) => (
                      <TaskItemRow
                        key={task.id}
                        task={task}
                        onToggle={() => toggleTaskMutation.mutate(task.id)}
                        onDelete={() => deleteTaskMutation.mutate(task.id)}
                        isDeleting={deleteTaskMutation.isPending}
                      />
                    ))}
                  </div>
                )}
                
                {completedTasks.length > 0 && (
                  <Collapsible open={showCompleted} onOpenChange={setShowCompleted}>
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground px-1 hover:text-foreground transition-colors w-full">
                      <ChevronDown className={`h-4 w-4 transition-transform ${showCompleted ? "" : "-rotate-90"}`} />
                      Completed ({completedTasks.length})
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 mt-2">
                      {completedTasks.map((task) => (
                        <TaskItemRow
                          key={task.id}
                          task={task}
                          onToggle={() => toggleTaskMutation.mutate(task.id)}
                          onDelete={() => deleteTaskMutation.mutate(task.id)}
                          isDeleting={deleteTaskMutation.isPending}
                        />
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        <div className="p-3 md:p-4 border-t border-border text-center shrink-0">
          <p className="text-xs text-muted-foreground">
            Ask ZEKE to add, complete, or manage your tasks
          </p>
        </div>
      </div>
    </div>
  );
}
