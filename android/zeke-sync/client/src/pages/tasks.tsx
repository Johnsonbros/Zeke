import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Trash2, 
  ListTodo,
  Check,
  Calendar,
  AlertCircle,
  Briefcase,
  User,
  Users,
  ChevronDown,
  Pencil,
  Sparkles,
  Clock,
  TrendingUp,
  BarChart3,
  Lightbulb
} from "lucide-react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import type { Task } from "@shared/schema";
import { format, isPast, isToday, parseISO, parse } from "date-fns";

interface QuickSuggestion {
  label: string;
  date: string;
  time: string;
}

interface PatternAnalysis {
  preferredDays: string[];
  preferredHours: number[];
  categoryBreakdown: { [key: string]: number };
  insights: string[];
}

interface SchedulingInsights {
  patterns: PatternAnalysis;
  recommendations: string[];
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

function formatTimeDisplay(time: string): string {
  try {
    const [hours, minutes] = time.split(":").map(Number);
    const period = hours >= 12 ? "pm" : "am";
    const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${displayHour}:${String(minutes).padStart(2, "0")}${period}`;
  } catch {
    return time;
  }
}

function formatHourDisplay(hour: number): string {
  const period = hour >= 12 ? "pm" : "am";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}${period}`;
}

const PRIORITIES = ["low", "medium", "high"] as const;
const CATEGORIES = ["work", "personal", "family"] as const;

const taskFormSchema = z.object({
  title: z.string().min(1, "Task title is required"),
  priority: z.enum(PRIORITIES).default("medium"),
  category: z.enum(CATEGORIES).default("personal"),
  dueDate: z.string().optional(),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

const editTaskFormSchema = z.object({
  title: z.string().min(1, "Task title is required"),
  description: z.string().optional(),
  priority: z.enum(PRIORITIES),
  category: z.enum(CATEGORIES),
  dueDate: z.string().optional(),
});

type EditTaskFormValues = z.infer<typeof editTaskFormSchema>;

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
  onEdit,
  isDeleting
}: { 
  task: Task; 
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
  isDeleting: boolean;
}) {
  const isOverdue = task.dueDate && !task.completed && isPast(parseISO(task.dueDate)) && !isToday(parseISO(task.dueDate));
  const isDueToday = task.dueDate && isToday(parseISO(task.dueDate));
  
  return (
    <div 
      className={`group flex items-center gap-2 sm:gap-3 px-2 sm:px-3 md:px-4 py-2 sm:py-3 rounded-lg border border-border hover-elevate transition-all cursor-pointer ${
        task.completed ? "opacity-60" : ""
      } ${isOverdue ? "border-red-500/50" : ""}`}
      data-testid={`task-item-${task.id}`}
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit();
        }
      }}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={task.completed}
          onCheckedChange={onToggle}
          className="h-4 w-4 sm:h-5 sm:w-5"
          data-testid={`checkbox-task-${task.id}`}
        />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <span 
            className={`text-xs sm:text-sm font-medium ${task.completed ? "line-through text-muted-foreground" : ""}`}
            data-testid={`text-task-title-${task.id}`}
          >
            {task.title}
          </span>
          <Badge 
            variant="outline" 
            className={`text-[10px] sm:text-xs ${getPriorityColor(task.priority)}`}
          >
            {task.priority}
          </Badge>
          <Badge variant="secondary" className="text-[10px] sm:text-xs gap-0.5 sm:gap-1">
            {getCategoryIcon(task.category)}
            <span className="hidden xs:inline">{task.category}</span>
          </Badge>
        </div>
        {task.description && (
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 line-clamp-1">{task.description}</p>
        )}
        {task.dueDate && (
          <div className={`flex items-center gap-1 mt-0.5 sm:mt-1 text-[10px] sm:text-xs ${
            isOverdue ? "text-red-500" : isDueToday ? "text-yellow-500" : "text-muted-foreground"
          }`}>
            {isOverdue && <AlertCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3" />}
            <Calendar className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            <span>
              {isOverdue ? "Late: " : isDueToday ? "Today: " : ""}
              {format(parseISO(task.dueDate), "MMM d")}
            </span>
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-0.5 sm:gap-1" onClick={(e) => e.stopPropagation()}>
        <Button
          size="icon"
          variant="ghost"
          className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          onClick={onEdit}
          data-testid={`button-edit-task-${task.id}`}
        >
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          onClick={onDelete}
          disabled={isDeleting}
          data-testid={`button-delete-task-${task.id}`}
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
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

function TaskEditDialog({
  task,
  open,
  onOpenChange,
  onSave,
  isPending
}: {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: EditTaskFormValues) => void;
  isPending: boolean;
}) {
  const editForm = useForm<EditTaskFormValues>({
    resolver: zodResolver(editTaskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
      category: "personal",
      dueDate: "",
    },
  });

  useEffect(() => {
    if (open && task) {
      editForm.reset({
        title: task.title,
        description: task.description || "",
        priority: task.priority as "low" | "medium" | "high",
        category: task.category as "work" | "personal" | "family",
        dueDate: task.dueDate || "",
      });
    }
  }, [open, task, editForm]);

  const handleSubmit = (data: EditTaskFormValues) => {
    onSave(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-edit-task">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Edit Task
          </DialogTitle>
          <DialogDescription>
            Update task details, priority, and due date
          </DialogDescription>
        </DialogHeader>
        
        <Form {...editForm}>
          <form onSubmit={editForm.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={editForm.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Task title"
                      disabled={isPending}
                      data-testid="input-edit-title"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <FormField
              control={editForm.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Add more details..."
                      className="resize-none"
                      rows={3}
                      disabled={isPending}
                      data-testid="input-edit-description"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={editForm.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-priority">
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
                control={editForm.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-category">
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
            </div>
            
            <FormField
              control={editForm.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due Date (optional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="date"
                      disabled={isPending}
                      data-testid="input-edit-due-date"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                data-testid="button-save-edit"
              >
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function QuickScheduleSuggestions({
  suggestions,
  isLoading,
  onSelect,
  disabled
}: {
  suggestions: QuickSuggestion[];
  isLoading: boolean;
  onSelect: (date: string) => void;
  disabled: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex gap-1.5 flex-wrap">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-md" />
        ))}
      </div>
    );
  }

  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="flex gap-1.5 flex-wrap items-center">
      <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
      {suggestions.map((suggestion, index) => (
        <Button
          key={index}
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1 px-2"
          onClick={() => onSelect(suggestion.date)}
          disabled={disabled}
          data-testid={`button-schedule-suggestion-${index}`}
        >
          <Clock className="h-3 w-3" />
          {suggestion.label} at {formatTimeDisplay(suggestion.time)}
        </Button>
      ))}
    </div>
  );
}

function SchedulingInsightsSection() {
  const [isOpen, setIsOpen] = useState(false);

  const { data: patterns, isLoading: patternsLoading } = useQuery<PatternAnalysis>({
    queryKey: ["/api/tasks/scheduling/patterns"],
    queryFn: async () => {
      const response = await fetch("/api/tasks/scheduling/patterns");
      if (!response.ok) throw new Error("Failed to fetch patterns");
      return response.json();
    },
    enabled: isOpen,
  });

  const { data: insights, isLoading: insightsLoading } = useQuery<SchedulingInsights>({
    queryKey: ["/api/tasks/scheduling/insights"],
    queryFn: async () => {
      const response = await fetch("/api/tasks/scheduling/insights");
      if (!response.ok) throw new Error("Failed to fetch insights");
      return response.json();
    },
    enabled: isOpen,
  });

  const isLoading = patternsLoading || insightsLoading;
  const totalTasks = patterns?.categoryBreakdown 
    ? Object.values(patterns.categoryBreakdown).reduce((a, b) => a + b, 0) 
    : 0;

  return (
    <Collapsible 
      open={isOpen} 
      onOpenChange={setIsOpen}
      data-testid="section-scheduling-insights"
    >
      <CollapsibleTrigger asChild>
        <Button 
          variant="ghost" 
          className="w-full justify-between h-10 text-sm text-muted-foreground hover:text-foreground"
          data-testid="button-toggle-insights"
        >
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Scheduling Insights
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card className="border-border">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 p-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Preferred Days
                  </CardTitle>
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <p 
                    className="text-sm font-medium"
                    data-testid="text-preferred-days"
                  >
                    {patterns?.preferredDays && patterns.preferredDays.length > 0
                      ? patterns.preferredDays.slice(0, 3).join(", ")
                      : "No pattern detected"}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 p-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Preferred Hours
                  </CardTitle>
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <p 
                    className="text-sm font-medium"
                    data-testid="text-preferred-hours"
                  >
                    {patterns?.preferredHours && patterns.preferredHours.length > 0
                      ? patterns.preferredHours.slice(0, 3).map(formatHourDisplay).join(", ")
                      : "No pattern detected"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {patterns?.categoryBreakdown && totalTasks > 0 && (
              <Card className="border-border">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 p-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Category Breakdown
                  </CardTitle>
                  <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="flex flex-wrap gap-2" data-testid="category-breakdown">
                    {Object.entries(patterns.categoryBreakdown).map(([category, count]) => {
                      const percentage = Math.round((count / totalTasks) * 100);
                      return (
                        <Badge 
                          key={category} 
                          variant="secondary" 
                          className="gap-1 text-xs"
                          data-testid={`category-stat-${category}`}
                        >
                          {getCategoryIcon(category)}
                          <span className="capitalize">{category}</span>
                          <span className="text-muted-foreground">{percentage}%</span>
                        </Badge>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {insights?.recommendations && insights.recommendations.length > 0 && (
              <Card className="border-border">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 p-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Recommendations
                  </CardTitle>
                  <Lightbulb className="h-3.5 w-3.5 text-muted-foreground" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <ul className="space-y-1.5" data-testid="recommendations-list">
                    {insights.recommendations.map((rec, index) => (
                      <li 
                        key={index} 
                        className="text-xs text-muted-foreground flex items-start gap-2"
                        data-testid={`recommendation-${index}`}
                      >
                        <span className="text-primary mt-0.5">•</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {patterns?.insights && patterns.insights.length > 0 && (
              <div className="space-y-1.5 px-1" data-testid="pattern-insights">
                {patterns.insights.map((insight, index) => (
                  <p 
                    key={index} 
                    className="text-xs text-muted-foreground"
                    data-testid={`insight-${index}`}
                  >
                    {insight}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function TasksPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterType>("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      priority: "medium",
      category: "personal",
      dueDate: "",
    },
  });

  const watchedTitle = form.watch("title");
  const watchedPriority = form.watch("priority");
  const watchedCategory = form.watch("category");
  
  const debouncedTitle = useDebounce(watchedTitle, 400);
  
  const { data: quickSuggestions, isLoading: suggestionsLoading } = useQuery<{ success: boolean; suggestions: QuickSuggestion[] }>({
    queryKey: ["/api/tasks/scheduling/quick-options", debouncedTitle, watchedPriority, watchedCategory],
    queryFn: async () => {
      const response = await apiRequest("POST", "/api/tasks/scheduling/quick-options", {
        title: debouncedTitle,
        priority: watchedPriority,
        category: watchedCategory,
      });
      return response.json();
    },
    enabled: debouncedTitle.length >= 2,
  });

  const handleSuggestionSelect = useCallback((date: string) => {
    form.setValue("dueDate", date);
  }, [form]);

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

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: EditTaskFormValues }) => {
      const response = await apiRequest("PATCH", `/api/tasks/${id}`, {
        title: data.title,
        description: data.description || "",
        priority: data.priority,
        category: data.category,
        dueDate: data.dueDate || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setIsEditDialogOpen(false);
      setSelectedTask(null);
      toast({
        title: "Task updated",
        description: "Your changes have been saved",
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

  const handleEditTask = (task: Task) => {
    setSelectedTask(task);
    setIsEditDialogOpen(true);
  };

  const pendingTasks = tasks?.filter(t => !t.completed) || [];
  const completedTasks = tasks?.filter(t => t.completed) || [];
  const totalTasks = tasks?.length || 0;

  return (
    <div className="flex flex-col h-screen h-[100dvh] bg-background" data-testid="tasks-page">
      <header className="h-11 sm:h-14 border-b border-border flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <ListTodo className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          <h1 className="text-base sm:text-lg md:text-xl font-semibold" data-testid="text-page-title">Tasks</h1>
        </div>
        
        {completedTasks.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearCompletedMutation.mutate()}
            disabled={clearCompletedMutation.isPending}
            className="gap-1 sm:gap-1.5 text-xs sm:text-sm"
            data-testid="button-clear-completed"
          >
            <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden xs:inline">Clear</span> {completedTasks.length}
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-hidden flex flex-col max-w-2xl mx-auto w-full">
        <div className="p-2 sm:p-3 md:p-4 border-b border-border shrink-0">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2 sm:space-y-3">
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
              
              {(debouncedTitle.length >= 2 || suggestionsLoading) && (
                <QuickScheduleSuggestions
                  suggestions={quickSuggestions?.suggestions || []}
                  isLoading={suggestionsLoading}
                  onSelect={handleSuggestionSelect}
                  disabled={addTaskMutation.isPending}
                />
              )}
              
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

        <div className="p-2 sm:p-3 md:p-4 border-b border-border shrink-0">
          <div className="flex gap-1.5 sm:gap-2 flex-wrap">
            {(["all", "work", "personal", "family", "overdue", "today"] as FilterType[]).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => setFilter(f)}
                className="capitalize h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3"
                data-testid={`filter-${f}`}
              >
                {f === "all" ? "All" : f === "overdue" ? "Overdue" : f === "today" ? "Today" : f}
              </Button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 sm:p-3 md:p-4 space-y-3 sm:space-y-4">
            {isLoading ? (
              <TaskListSkeleton />
            ) : totalTasks === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-center">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-primary/10 flex items-center justify-center mb-3 sm:mb-4">
                  <ListTodo className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
                </div>
                <h2 className="text-base sm:text-lg font-medium mb-1" data-testid="text-empty-state">No tasks</h2>
                <p className="text-xs sm:text-sm text-muted-foreground px-4">Add tasks above or ask ZEKE to help you manage them</p>
              </div>
            ) : (
              <>
                {pendingTasks.length > 0 && (
                  <div className="space-y-1.5 sm:space-y-2">
                    <h2 className="text-xs sm:text-sm font-medium text-muted-foreground px-1">
                      To Do ({pendingTasks.length})
                    </h2>
                    {pendingTasks.map((task) => (
                      <TaskItemRow
                        key={task.id}
                        task={task}
                        onToggle={() => toggleTaskMutation.mutate(task.id)}
                        onDelete={() => deleteTaskMutation.mutate(task.id)}
                        onEdit={() => handleEditTask(task)}
                        isDeleting={deleteTaskMutation.isPending}
                      />
                    ))}
                  </div>
                )}
                
                {completedTasks.length > 0 && (
                  <Collapsible open={showCompleted} onOpenChange={setShowCompleted}>
                    <CollapsibleTrigger className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium text-muted-foreground px-1 hover:text-foreground transition-colors w-full">
                      <ChevronDown className={`h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform ${showCompleted ? "" : "-rotate-90"}`} />
                      Completed ({completedTasks.length})
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1.5 sm:space-y-2 mt-1.5 sm:mt-2">
                      {completedTasks.map((task) => (
                        <TaskItemRow
                          key={task.id}
                          task={task}
                          onToggle={() => toggleTaskMutation.mutate(task.id)}
                          onDelete={() => deleteTaskMutation.mutate(task.id)}
                          onEdit={() => handleEditTask(task)}
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

        <div className="p-2 sm:p-3 md:p-4 border-t border-border shrink-0">
          <SchedulingInsightsSection />
        </div>

        <div className="p-2 sm:p-3 md:p-4 border-t border-border text-center shrink-0">
          <p className="text-[10px] sm:text-xs text-muted-foreground">
            Ask ZEKE to add, complete, or manage your tasks
          </p>
        </div>
      </div>

      <TaskEditDialog
        task={selectedTask}
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) setSelectedTask(null);
        }}
        onSave={(data) => {
          if (selectedTask) {
            updateTaskMutation.mutate({ id: selectedTask.id, data });
          }
        }}
        isPending={updateTaskMutation.isPending}
      />
    </div>
  );
}
