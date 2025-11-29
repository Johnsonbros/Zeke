import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Trash2, 
  Clock,
  Bell,
  Play,
  Pencil,
  AlertCircle,
  Phone,
  Calendar,
  Zap,
  Sun,
  MessageSquare,
  CheckCircle
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
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
} from "@/components/ui/form";
import type { Reminder, Automation } from "@shared/schema";
import { automationTypes } from "@shared/schema";
import { format, isPast, parseISO } from "date-fns";

const AUTOMATION_TYPE_CONFIG: Record<string, { label: string; icon: typeof Sun; color: string }> = {
  morning_briefing: { label: "Morning Briefing", icon: Sun, color: "text-yellow-500" },
  scheduled_sms: { label: "Scheduled SMS", icon: MessageSquare, color: "text-blue-500" },
  daily_checkin: { label: "Daily Check-in", icon: CheckCircle, color: "text-green-500" },
};

const CRON_PRESETS = [
  { label: "Daily at 9am", value: "0 9 * * *" },
  { label: "Daily at 8am", value: "0 8 * * *" },
  { label: "Daily at 6pm", value: "0 18 * * *" },
  { label: "Weekly on Monday at 9am", value: "0 9 * * 1" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 30 minutes", value: "*/30 * * * *" },
];

function formatCronExpression(cron: string): string {
  const preset = CRON_PRESETS.find(p => p.value === cron);
  if (preset) return preset.label;
  
  const parts = cron.split(" ");
  if (parts.length !== 5) return cron;
  
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  
  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    if (minute === "0" && hour !== "*") {
      return `Daily at ${hour}:00`;
    }
    if (minute.startsWith("*/")) {
      return `Every ${minute.slice(2)} minutes`;
    }
    if (hour.startsWith("*/")) {
      return `Every ${hour.slice(2)} hours`;
    }
  }
  
  return cron;
}

function formatPhoneDisplay(phone: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

const reminderFormSchema = z.object({
  message: z.string().min(1, "Message is required"),
  scheduledFor: z.string().min(1, "Scheduled time is required"),
  recipientPhone: z.string().optional(),
});

type ReminderFormValues = z.infer<typeof reminderFormSchema>;

const automationFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(automationTypes),
  cronExpression: z.string().min(1, "Schedule is required"),
  recipientPhone: z.string().optional(),
  message: z.string().optional(),
  enabled: z.boolean().default(true),
});

type AutomationFormValues = z.infer<typeof automationFormSchema>;

function ReminderItem({ 
  reminder, 
  onEdit,
  onDelete,
  isDeleting
}: { 
  reminder: Reminder;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const scheduledDate = parseISO(reminder.scheduledFor);
  const isOverdue = !reminder.completed && isPast(scheduledDate);
  
  let statusColor = "text-muted-foreground";
  let statusLabel = "Pending";
  
  if (reminder.completed) {
    statusColor = "text-green-500";
    statusLabel = "Completed";
  } else if (isOverdue) {
    statusColor = "text-red-500";
    statusLabel = "Overdue";
  }
  
  return (
    <div 
      className={`group flex items-start gap-3 px-3 md:px-4 py-3 rounded-lg border border-border hover-elevate transition-all ${
        reminder.completed ? "opacity-60" : ""
      } ${isOverdue ? "border-red-500/50" : ""}`}
      data-testid={`reminder-item-${reminder.id}`}
    >
      <div className="mt-0.5">
        <Bell className={`h-4 w-4 ${isOverdue ? "text-red-500" : reminder.completed ? "text-green-500" : "text-primary"}`} />
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" data-testid={`text-reminder-message-${reminder.id}`}>
          {reminder.message}
        </p>
        
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <div className={`flex items-center gap-1 text-xs ${statusColor}`}>
            {isOverdue && <AlertCircle className="h-3 w-3" />}
            <Clock className="h-3 w-3" />
            <span>{format(scheduledDate, "MMM d, yyyy 'at' h:mm a")}</span>
          </div>
          
          {reminder.recipientPhone && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              <span>{formatPhoneDisplay(reminder.recipientPhone)}</span>
            </div>
          )}
          
          <Badge 
            variant={reminder.completed ? "secondary" : isOverdue ? "destructive" : "outline"} 
            className="text-xs"
          >
            {statusLabel}
          </Badge>
        </div>
      </div>
      
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onEdit}
          data-testid={`button-edit-reminder-${reminder.id}`}
        >
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onDelete}
          disabled={isDeleting}
          data-testid={`button-delete-reminder-${reminder.id}`}
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

function AutomationItem({ 
  automation, 
  onEdit,
  onDelete,
  onToggle,
  onRun,
  isDeleting,
  isToggling,
  isRunning
}: { 
  automation: Automation;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onRun: () => void;
  isDeleting: boolean;
  isToggling: boolean;
  isRunning: boolean;
}) {
  const typeConfig = AUTOMATION_TYPE_CONFIG[automation.type] || { 
    label: automation.type, 
    icon: Zap, 
    color: "text-muted-foreground" 
  };
  const TypeIcon = typeConfig.icon;
  
  return (
    <div 
      className={`group flex items-start gap-3 px-3 md:px-4 py-3 rounded-lg border border-border hover-elevate transition-all ${
        !automation.enabled ? "opacity-60" : ""
      }`}
      data-testid={`automation-item-${automation.id}`}
    >
      <div className="mt-0.5">
        <Zap className={`h-4 w-4 ${automation.enabled ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium" data-testid={`text-automation-name-${automation.id}`}>
            {automation.name}
          </span>
          <Badge variant="outline" className={`text-xs gap-1 ${typeConfig.color}`}>
            <TypeIcon className="h-3 w-3" />
            {typeConfig.label}
          </Badge>
        </div>
        
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{formatCronExpression(automation.cronExpression)}</span>
          </div>
          
          {automation.recipientPhone && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              <span>{formatPhoneDisplay(automation.recipientPhone)}</span>
            </div>
          )}
          
          {automation.lastRun && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Last: {format(parseISO(automation.lastRun), "MMM d 'at' h:mm a")}</span>
            </div>
          )}
        </div>
        
        {automation.message && automation.type === "scheduled_sms" && (
          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">
            "{automation.message}"
          </p>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        <Switch
          checked={automation.enabled}
          onCheckedChange={onToggle}
          disabled={isToggling}
          data-testid={`switch-automation-${automation.id}`}
        />
        
        <Button
          size="icon"
          variant="ghost"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onRun}
          disabled={isRunning || !automation.enabled}
          data-testid={`button-run-automation-${automation.id}`}
        >
          <Play className="h-4 w-4 text-muted-foreground" />
        </Button>
        
        <Button
          size="icon"
          variant="ghost"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onEdit}
          data-testid={`button-edit-automation-${automation.id}`}
        >
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </Button>
        
        <Button
          size="icon"
          variant="ghost"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onDelete}
          disabled={isDeleting}
          data-testid={`button-delete-automation-${automation.id}`}
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 rounded-lg" />
      ))}
    </div>
  );
}

function ReminderEditDialog({
  reminder,
  open,
  onOpenChange,
  onSave,
  isPending
}: {
  reminder: Reminder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: ReminderFormValues) => void;
  isPending: boolean;
}) {
  const form = useForm<ReminderFormValues>({
    resolver: zodResolver(reminderFormSchema),
    defaultValues: {
      message: "",
      scheduledFor: "",
      recipientPhone: "",
    },
  });

  useEffect(() => {
    if (open && reminder) {
      const scheduledDate = parseISO(reminder.scheduledFor);
      form.reset({
        message: reminder.message,
        scheduledFor: format(scheduledDate, "yyyy-MM-dd'T'HH:mm"),
        recipientPhone: reminder.recipientPhone || "",
      });
    }
  }, [open, reminder, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-edit-reminder">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Edit Reminder
          </DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Reminder message..."
                      className="resize-none"
                      rows={3}
                      disabled={isPending}
                      data-testid="input-reminder-message"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="scheduledFor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Scheduled Time</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="datetime-local"
                      disabled={isPending}
                      data-testid="input-reminder-scheduled"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="recipientPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipient Phone (optional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="(555) 123-4567"
                      disabled={isPending}
                      data-testid="input-reminder-phone"
                    />
                  </FormControl>
                  <FormDescription>
                    Leave blank to show reminder in web only
                  </FormDescription>
                </FormItem>
              )}
            />
            
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                data-testid="button-cancel-reminder"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                data-testid="button-save-reminder"
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

function AutomationDialog({
  automation,
  open,
  onOpenChange,
  onSave,
  isPending,
  mode
}: {
  automation: Automation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: AutomationFormValues) => void;
  isPending: boolean;
  mode: "create" | "edit";
}) {
  const form = useForm<AutomationFormValues>({
    resolver: zodResolver(automationFormSchema),
    defaultValues: {
      name: "",
      type: "morning_briefing",
      cronExpression: "0 9 * * *",
      recipientPhone: "",
      message: "",
      enabled: true,
    },
  });

  const selectedType = form.watch("type");
  const [usePreset, setUsePreset] = useState(true);

  useEffect(() => {
    if (open) {
      if (mode === "edit" && automation) {
        form.reset({
          name: automation.name,
          type: automation.type,
          cronExpression: automation.cronExpression,
          recipientPhone: automation.recipientPhone || "",
          message: automation.message || "",
          enabled: automation.enabled,
        });
        setUsePreset(CRON_PRESETS.some(p => p.value === automation.cronExpression));
      } else {
        form.reset({
          name: "",
          type: "morning_briefing",
          cronExpression: "0 9 * * *",
          recipientPhone: "",
          message: "",
          enabled: true,
        });
        setUsePreset(true);
      }
    }
  }, [open, automation, mode, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-automation">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            {mode === "create" ? "Create Automation" : "Edit Automation"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create" 
              ? "Set up a recurring scheduled job" 
              : "Update automation settings"}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Automation name..."
                      disabled={isPending}
                      data-testid="input-automation-name"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                    <FormControl>
                      <SelectTrigger data-testid="select-automation-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {automationTypes.map((type) => {
                        const config = AUTOMATION_TYPE_CONFIG[type];
                        return (
                          <SelectItem key={type} value={type}>
                            <span className="flex items-center gap-2">
                              <config.icon className={`h-4 w-4 ${config.color}`} />
                              {config.label}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            
            <div className="space-y-2">
              <FormLabel>Schedule</FormLabel>
              <div className="flex gap-2 mb-2">
                <Button
                  type="button"
                  size="sm"
                  variant={usePreset ? "default" : "outline"}
                  onClick={() => setUsePreset(true)}
                  data-testid="button-preset-schedule"
                >
                  Preset
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!usePreset ? "default" : "outline"}
                  onClick={() => setUsePreset(false)}
                  data-testid="button-custom-schedule"
                >
                  Custom
                </Button>
              </div>
              
              <FormField
                control={form.control}
                name="cronExpression"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      {usePreset ? (
                        <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                          <SelectTrigger data-testid="select-cron-preset">
                            <SelectValue placeholder="Select schedule" />
                          </SelectTrigger>
                          <SelectContent>
                            {CRON_PRESETS.map((preset) => (
                              <SelectItem key={preset.value} value={preset.value}>
                                {preset.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          {...field}
                          placeholder="0 9 * * *"
                          disabled={isPending}
                          data-testid="input-cron-expression"
                        />
                      )}
                    </FormControl>
                    {!usePreset && (
                      <FormDescription>
                        Cron format: minute hour day-of-month month day-of-week
                      </FormDescription>
                    )}
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="recipientPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipient Phone (optional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="(555) 123-4567"
                      disabled={isPending}
                      data-testid="input-automation-phone"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            
            {selectedType === "scheduled_sms" && (
              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="SMS message to send..."
                        className="resize-none"
                        rows={3}
                        disabled={isPending}
                        data-testid="input-automation-message"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
            
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                data-testid="button-cancel-automation"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                data-testid="button-save-automation"
              >
                {isPending ? "Saving..." : mode === "create" ? "Create" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function AutomationsPage() {
  const { toast } = useToast();
  
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
  const [isReminderDialogOpen, setIsReminderDialogOpen] = useState(false);
  const [reminderToDelete, setReminderToDelete] = useState<Reminder | null>(null);
  
  const [selectedAutomation, setSelectedAutomation] = useState<Automation | null>(null);
  const [isAutomationDialogOpen, setIsAutomationDialogOpen] = useState(false);
  const [automationDialogMode, setAutomationDialogMode] = useState<"create" | "edit">("create");
  const [automationToDelete, setAutomationToDelete] = useState<Automation | null>(null);

  const { data: reminders, isLoading: isLoadingReminders } = useQuery<Reminder[]>({
    queryKey: ["/api/reminders"],
  });

  const { data: automations, isLoading: isLoadingAutomations } = useQuery<Automation[]>({
    queryKey: ["/api/automations"],
  });

  const updateReminderMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ReminderFormValues }) => {
      const response = await apiRequest("PATCH", `/api/reminders/${id}`, {
        message: data.message,
        scheduledFor: new Date(data.scheduledFor).toISOString(),
        recipientPhone: data.recipientPhone || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
      setIsReminderDialogOpen(false);
      setSelectedReminder(null);
      toast({
        title: "Reminder updated",
        description: "Your changes have been saved",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update reminder",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteReminderMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/reminders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
      setReminderToDelete(null);
      toast({
        title: "Reminder deleted",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete reminder",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createAutomationMutation = useMutation({
    mutationFn: async (data: AutomationFormValues) => {
      const response = await apiRequest("POST", "/api/automations", {
        name: data.name,
        type: data.type,
        cronExpression: data.cronExpression,
        enabled: data.enabled,
        recipientPhone: data.recipientPhone || null,
        message: data.message || null,
        settings: null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations"] });
      setIsAutomationDialogOpen(false);
      toast({
        title: "Automation created",
        description: "Your new automation has been set up",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create automation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateAutomationMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: AutomationFormValues }) => {
      const response = await apiRequest("PATCH", `/api/automations/${id}`, {
        name: data.name,
        type: data.type,
        cronExpression: data.cronExpression,
        enabled: data.enabled,
        recipientPhone: data.recipientPhone || null,
        message: data.message || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations"] });
      setIsAutomationDialogOpen(false);
      setSelectedAutomation(null);
      toast({
        title: "Automation updated",
        description: "Your changes have been saved",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update automation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteAutomationMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/automations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations"] });
      setAutomationToDelete(null);
      toast({
        title: "Automation deleted",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete automation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleAutomationMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/automations/${id}/toggle`);
      return response.json();
    },
    onSuccess: (data: Automation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations"] });
      toast({
        title: data.enabled ? "Automation enabled" : "Automation disabled",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to toggle automation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const runAutomationMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/automations/${id}/run`);
      return response.json();
    },
    onSuccess: (data: { message: string }) => {
      toast({
        title: "Automation triggered",
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to run automation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEditReminder = (reminder: Reminder) => {
    setSelectedReminder(reminder);
    setIsReminderDialogOpen(true);
  };

  const handleCreateAutomation = () => {
    setSelectedAutomation(null);
    setAutomationDialogMode("create");
    setIsAutomationDialogOpen(true);
  };

  const handleEditAutomation = (automation: Automation) => {
    setSelectedAutomation(automation);
    setAutomationDialogMode("edit");
    setIsAutomationDialogOpen(true);
  };

  const sortedReminders = reminders?.slice().sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    return new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime();
  }) || [];

  const pendingReminders = sortedReminders.filter(r => !r.completed);
  const completedReminders = sortedReminders.filter(r => r.completed);

  return (
    <div className="flex flex-col h-screen h-[100dvh] bg-background" data-testid="automations-page">
      <header className="h-14 md:h-16 border-b border-border flex items-center justify-between gap-3 px-3 md:px-6 shrink-0">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h1 className="text-lg md:text-xl font-semibold" data-testid="text-page-title">Automations</h1>
        </div>
        
        <Button
          onClick={handleCreateAutomation}
          className="gap-1.5"
          data-testid="button-add-automation"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add Automation</span>
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto w-full p-3 md:p-4 space-y-8">
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Bell className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold" data-testid="section-reminders">Reminders</h2>
              {pendingReminders.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {pendingReminders.length} pending
                </Badge>
              )}
            </div>
            
            {isLoadingReminders ? (
              <ListSkeleton />
            ) : sortedReminders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Bell className="h-6 w-6 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">No reminders set</p>
                <p className="text-xs text-muted-foreground mt-1">Ask ZEKE to remind you about something</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedReminders.map((reminder) => (
                  <ReminderItem
                    key={reminder.id}
                    reminder={reminder}
                    onEdit={() => handleEditReminder(reminder)}
                    onDelete={() => setReminderToDelete(reminder)}
                    isDeleting={deleteReminderMutation.isPending}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4">
              <Zap className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold" data-testid="section-automations">Scheduled Automations</h2>
              {automations && automations.filter(a => a.enabled).length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {automations.filter(a => a.enabled).length} active
                </Badge>
              )}
            </div>
            
            {isLoadingAutomations ? (
              <ListSkeleton />
            ) : !automations || automations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">No automations set up</p>
                <p className="text-xs text-muted-foreground mt-1">Create recurring scheduled jobs</p>
                <Button
                  onClick={handleCreateAutomation}
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-1.5"
                  data-testid="button-add-automation-empty"
                >
                  <Plus className="h-4 w-4" />
                  Add Automation
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {automations.map((automation) => (
                  <AutomationItem
                    key={automation.id}
                    automation={automation}
                    onEdit={() => handleEditAutomation(automation)}
                    onDelete={() => setAutomationToDelete(automation)}
                    onToggle={() => toggleAutomationMutation.mutate(automation.id)}
                    onRun={() => runAutomationMutation.mutate(automation.id)}
                    isDeleting={deleteAutomationMutation.isPending}
                    isToggling={toggleAutomationMutation.isPending}
                    isRunning={runAutomationMutation.isPending}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </ScrollArea>

      <div className="p-3 md:p-4 border-t border-border text-center shrink-0">
        <p className="text-xs text-muted-foreground">
          Ask ZEKE to set reminders or manage your automations
        </p>
      </div>

      <ReminderEditDialog
        reminder={selectedReminder}
        open={isReminderDialogOpen}
        onOpenChange={(open) => {
          setIsReminderDialogOpen(open);
          if (!open) setSelectedReminder(null);
        }}
        onSave={(data) => {
          if (selectedReminder) {
            updateReminderMutation.mutate({ id: selectedReminder.id, data });
          }
        }}
        isPending={updateReminderMutation.isPending}
      />

      <AutomationDialog
        automation={selectedAutomation}
        open={isAutomationDialogOpen}
        onOpenChange={(open) => {
          setIsAutomationDialogOpen(open);
          if (!open) setSelectedAutomation(null);
        }}
        onSave={(data) => {
          if (automationDialogMode === "create") {
            createAutomationMutation.mutate(data);
          } else if (selectedAutomation) {
            updateAutomationMutation.mutate({ id: selectedAutomation.id, data });
          }
        }}
        isPending={automationDialogMode === "create" 
          ? createAutomationMutation.isPending 
          : updateAutomationMutation.isPending}
        mode={automationDialogMode}
      />

      <AlertDialog open={!!reminderToDelete} onOpenChange={(open) => !open && setReminderToDelete(null)}>
        <AlertDialogContent data-testid="dialog-delete-reminder">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reminder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this reminder? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-reminder">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => reminderToDelete && deleteReminderMutation.mutate(reminderToDelete.id)}
              data-testid="button-confirm-delete-reminder"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!automationToDelete} onOpenChange={(open) => !open && setAutomationToDelete(null)}>
        <AlertDialogContent data-testid="dialog-delete-automation">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Automation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{automationToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-automation">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => automationToDelete && deleteAutomationMutation.mutate(automationToDelete.id)}
              data-testid="button-confirm-delete-automation"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
