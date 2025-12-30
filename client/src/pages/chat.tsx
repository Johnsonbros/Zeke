import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Send, 
  Plus, 
  MessageSquare, 
  Trash2, 
  Smartphone,
  Sparkles,
  Bell,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ListTodo,
  History,
  ChevronDown,
  Paperclip,
  X,
  FileText,
  Image,
  Loader2,
  Mic,
  Square
} from "lucide-react";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { 
  Conversation, 
  Message, 
  ChatResponse, 
  Reminder, 
  Task, 
  UploadedFile,
  ChatCard,
  TaskCard,
  ReminderCard,
  WeatherCard,
  GroceryListCard,
  CalendarEventCard
} from "@shared/schema";
import { format, isToday, isTomorrow, isPast, parseISO } from "date-fns";
import { Cloud, Sun, CloudRain, Snowflake, ShoppingCart, MapPin, User, Radio } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 px-4 py-2" data-testid="typing-indicator">
      <Avatar className="h-8 w-8 sm:h-9 sm:w-9 shrink-0">
        <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
          Z
        </AvatarFallback>
      </Avatar>
      <div className="bg-accent rounded-2xl px-4 py-3 shadow-sm">
        <div className="flex gap-1.5">
          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

interface PendantStatus {
  connected: boolean;
  streaming: boolean;
  healthy: boolean;
  lastAudioReceivedAt: string | null;
  totalAudioPackets: number;
  timeSinceLastAudioMs: number | null;
}

function PendantStatusBadge() {
  const { data: status, isLoading } = useQuery<PendantStatus>({
    queryKey: ["/api/pendant/status"],
    refetchInterval: 3000,
  });

  if (isLoading) {
    return null;
  }

  const getStatusInfo = () => {
    if (!status || !status.connected) {
      return {
        color: "bg-muted-foreground/50",
        label: "Pendant disconnected",
        pulse: false,
      };
    }
    if (status.streaming) {
      return {
        color: "bg-green-500",
        label: "Listening...",
        pulse: true,
      };
    }
    return {
      color: "bg-green-500/70",
      label: "Pendant connected",
      pulse: false,
    };
  };

  const { color, label, pulse } = getStatusInfo();

  const formatLastSeen = () => {
    if (!status?.lastAudioReceivedAt) return "Never";
    const date = new Date(status.lastAudioReceivedAt);
    return format(date, "h:mm a");
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div 
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-secondary/50 cursor-default"
          data-testid="pendant-status-badge"
        >
          <div className="relative">
            <div className={`w-2 h-2 rounded-full ${color}`} />
            {pulse && (
              <div className={`absolute inset-0 w-2 h-2 rounded-full ${color} animate-ping`} />
            )}
          </div>
          <Radio className="h-3 w-3 text-muted-foreground" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        <div className="space-y-1">
          <p className="font-medium">{label}</p>
          {status?.connected && (
            <>
              <p className="text-muted-foreground">Last audio: {formatLastSeen()}</p>
              <p className="text-muted-foreground">Packets: {status.totalAudioPackets.toLocaleString()}</p>
            </>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function getWeatherIcon(condition: string) {
  const lower = condition.toLowerCase();
  if (lower.includes('rain') || lower.includes('shower')) return CloudRain;
  if (lower.includes('snow')) return Snowflake;
  if (lower.includes('cloud') || lower.includes('overcast')) return Cloud;
  return Sun;
}

function TaskCardDisplay({ card }: { card: TaskCard }) {
  const isOverdue = card.dueDate && isPast(parseISO(card.dueDate)) && !isToday(parseISO(card.dueDate));
  
  return (
    <Card className="p-3 flex items-start gap-3" data-testid={`card-task-${card.id}`}>
      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
        card.completed ? "bg-green-500/10" : isOverdue ? "bg-destructive/10" : "bg-blue-500/10"
      }`}>
        {card.completed ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : isOverdue ? (
          <AlertCircle className="h-4 w-4 text-destructive" />
        ) : (
          <ListTodo className="h-4 w-4 text-blue-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${card.completed ? "line-through text-muted-foreground" : ""}`}>
          {card.title}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <Badge variant="secondary" className="text-[10px]">{card.priority}</Badge>
          {card.dueDate && (
            <span className={`text-xs ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
              {isToday(parseISO(card.dueDate)) ? "Due today" : 
               isTomorrow(parseISO(card.dueDate)) ? "Due tomorrow" :
               isOverdue ? "Overdue" : format(parseISO(card.dueDate), "MMM d")}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

function ReminderCardDisplay({ card }: { card: ReminderCard }) {
  return (
    <Card className="p-3 flex items-start gap-3" data-testid={`card-reminder-${card.id}`}>
      <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
        <Bell className="h-4 w-4 text-amber-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{card.message}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {isToday(parseISO(card.scheduledFor)) 
            ? `Today at ${format(parseISO(card.scheduledFor), "h:mm a")}`
            : isTomorrow(parseISO(card.scheduledFor))
            ? `Tomorrow at ${format(parseISO(card.scheduledFor), "h:mm a")}`
            : format(parseISO(card.scheduledFor), "MMM d 'at' h:mm a")}
        </p>
      </div>
    </Card>
  );
}

function WeatherCardDisplay({ card }: { card: WeatherCard }) {
  const WeatherIcon = getWeatherIcon(card.condition);
  
  return (
    <Card className="p-4" data-testid="card-weather">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
          <WeatherIcon className="h-7 w-7 text-blue-500" />
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold">{card.temperature}</span>
            <span className="text-lg text-muted-foreground">°F</span>
          </div>
          <p className="text-sm text-muted-foreground">{card.condition}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{card.location}</p>
        </div>
      </div>
      {card.humidity !== undefined && (
        <div className="flex gap-4 mt-3 pt-3 border-t text-xs text-muted-foreground">
          <span>Humidity: {card.humidity}%</span>
          {card.windSpeed !== undefined && <span>Wind: {card.windSpeed} mph</span>}
        </div>
      )}
    </Card>
  );
}

function GroceryCardDisplay({ card }: { card: GroceryListCard }) {
  return (
    <Card className="p-3" data-testid="card-grocery">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
          <ShoppingCart className="h-4 w-4 text-green-500" />
        </div>
        <div>
          <p className="text-sm font-medium">Grocery List</p>
          <p className="text-xs text-muted-foreground">{card.totalItems} items</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {card.items.slice(0, 5).map((item) => (
          <div key={item.id} className="flex items-center gap-2 text-sm">
            <div className={`w-1.5 h-1.5 rounded-full ${item.purchased ? "bg-green-500" : "bg-muted-foreground"}`} />
            <span className={item.purchased ? "line-through text-muted-foreground" : ""}>
              {item.quantity !== "1" && `${item.quantity} `}{item.name}
            </span>
          </div>
        ))}
        {card.items.length > 5 && (
          <p className="text-xs text-muted-foreground mt-2">+{card.items.length - 5} more items</p>
        )}
      </div>
    </Card>
  );
}

function CalendarCardDisplay({ card }: { card: CalendarEventCard }) {
  return (
    <Card className="p-3 flex items-start gap-3" data-testid={`card-calendar-${card.id}`}>
      <div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
        <Calendar className="h-4 w-4 text-purple-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{card.title}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {format(parseISO(card.startTime), "MMM d 'at' h:mm a")}
          {card.endTime && ` - ${format(parseISO(card.endTime), "h:mm a")}`}
        </p>
        {card.location && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <MapPin className="h-3 w-3" />
            {card.location}
          </div>
        )}
      </div>
    </Card>
  );
}

function ChatCardDisplay({ card }: { card: ChatCard }) {
  switch (card.type) {
    case "task":
      return <TaskCardDisplay card={card} />;
    case "reminder":
      return <ReminderCardDisplay card={card} />;
    case "weather":
      return <WeatherCardDisplay card={card} />;
    case "grocery_list":
      return <GroceryCardDisplay card={card} />;
    case "calendar_event":
      return <CalendarCardDisplay card={card} />;
    case "task_list":
      return (
        <div className="space-y-2" data-testid="card-task-list">
          {card.tasks.map((task) => (
            <TaskCardDisplay key={task.id} card={task} />
          ))}
        </div>
      );
    case "reminder_list":
      return (
        <div className="space-y-2" data-testid="card-reminder-list">
          {card.reminders.map((reminder) => (
            <ReminderCardDisplay key={reminder.id} card={reminder} />
          ))}
        </div>
      );
    default:
      return null;
  }
}

function CardsDisplay({ cards }: { cards: ChatCard[] }) {
  if (!cards || cards.length === 0) return null;
  
  return (
    <div className="flex items-start gap-3 px-4 py-2">
      <Avatar className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 invisible" aria-hidden>
        <AvatarFallback>Z</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-2 max-w-[85%] sm:max-w-[75%] md:max-w-[70%]">
        {cards.map((card, index) => (
          <ChatCardDisplay key={`${card.type}-${index}`} card={card} />
        ))}
      </div>
    </div>
  );
}

function getSourceBadge(source: string | undefined) {
  switch (source) {
    case "sms":
      return { icon: Smartphone, label: "SMS", color: "bg-green-500/10 text-green-600 dark:text-green-400" };
    case "web":
      return { icon: MessageSquare, label: "Web", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" };
    case "app":
      return { icon: Smartphone, label: "App", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" };
    case "voice":
      return { icon: Mic, label: "Voice", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" };
    default:
      return null;
  }
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const sourceBadge = isUser ? getSourceBadge(message.source) : null;

  return (
    <div
      className={`flex items-start gap-3 px-4 py-2 ${isUser ? "flex-row-reverse" : ""}`}
      data-testid={`message-${message.id}`}
    >
      <Avatar className="h-8 w-8 sm:h-9 sm:w-9 shrink-0">
        <AvatarFallback
          className={`text-sm font-semibold ${
            isUser
              ? "bg-accent text-accent-foreground"
              : "bg-primary text-primary-foreground"
          }`}
        >
          {isUser ? "NJ" : "Z"}
        </AvatarFallback>
      </Avatar>

      <div className={`flex flex-col max-w-[85%] sm:max-w-[75%] md:max-w-[70%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-2xl px-4 py-3 relative shadow-sm ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-accent text-accent-foreground"
          }`}
        >
          {sourceBadge && (
            <div
              className={`absolute -top-1 ${isUser ? "-left-1" : "-right-1"} flex items-center gap-1 px-2 py-0.5 rounded-full ${sourceBadge.color} text-[10px] font-medium`}
              data-testid={`source-badge-${message.id}`}
            >
              <sourceBadge.icon className="h-2.5 w-2.5" />
              <span>{sourceBadge.label}</span>
            </div>
          )}
          <p className="text-sm sm:text-base whitespace-pre-wrap leading-relaxed">{message.content}</p>
        </div>
        <span className="text-xs text-muted-foreground mt-1.5 px-1">
          {format(new Date(message.createdAt), "h:mm a")}
        </span>
      </div>
    </div>
  );
}

function ConversationItem({ 
  conversation, 
  isActive, 
  onClick,
  onDelete 
}: { 
  conversation: Conversation; 
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group relative flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors hover-elevate ${
        isActive ? "bg-accent" : ""
      }`}
      onClick={onClick}
      data-testid={`conversation-${conversation.id}`}
    >
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r" />
      )}
      <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{conversation.title}</p>
        <p className="text-[10px] text-muted-foreground">
          {format(new Date(conversation.updatedAt), "MMM d, h:mm a")}
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        data-testid={`delete-conversation-${conversation.id}`}
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning, Nate";
  if (hour < 17) return "Good afternoon, Nate";
  return "Good evening, Nate";
}

function getPersonalizedSubtitle(tasks: Task[], reminders: Reminder[]): string {
  const hour = new Date().getHours();
  const overdueCount = tasks.filter(t => 
    t.dueDate && !t.completed && isPast(parseISO(t.dueDate)) && !isToday(parseISO(t.dueDate))
  ).length;
  
  if (hour >= 5 && hour < 9) return "Let's get your day started";
  if (overdueCount > 0) {
    return overdueCount === 1 
      ? "You have 1 item that needs attention" 
      : `You have ${overdueCount} items that need attention`;
  }
  if (hour >= 9 && hour < 12) return "Ready when you are";
  if (hour >= 12 && hour < 17) return "How's the day going?";
  if (hour >= 17 && hour < 21) return "Time to wind down";
  return "Still working? I'm here if you need me";
}

function formatReminderTime(scheduledFor: string): string {
  const date = parseISO(scheduledFor);
  if (isToday(date)) return `Today at ${format(date, "h:mm a")}`;
  if (isTomorrow(date)) return `Tomorrow at ${format(date, "h:mm a")}`;
  return format(date, "MMM d 'at' h:mm a");
}

function formatTaskDue(dueDate: string | null): string {
  if (!dueDate) return "";
  const date = parseISO(dueDate);
  if (isToday(date)) return "Due today";
  if (isTomorrow(date)) return "Due tomorrow";
  if (isPast(date)) return "Overdue";
  return `Due ${format(date, "MMM d")}`;
}

function generateSmartPrompts(
  reminders: Reminder[],
  tasks: Task[]
): { text: string; icon: typeof Bell }[] {
  const prompts: { text: string; icon: typeof Bell }[] = [];
  const hour = new Date().getHours();
  const overdueCount = tasks.filter(t => 
    t.dueDate && !t.completed && isPast(parseISO(t.dueDate)) && !isToday(parseISO(t.dueDate))
  ).length;

  if (hour >= 5 && hour < 11) {
    prompts.push({ text: "Give me my morning briefing", icon: Calendar });
  }
  if (hour >= 19 || hour < 2) {
    prompts.push({ text: "Give me my evening debrief", icon: Clock });
  }
  if (overdueCount > 0) {
    prompts.push({ text: `I have ${overdueCount} overdue item${overdueCount > 1 ? 's' : ''} to deal with`, icon: AlertCircle });
  }
  if (hour >= 17 && hour < 21) {
    prompts.push({ text: "Help me plan tomorrow", icon: Calendar });
  } else if (hour >= 11 && hour < 14) {
    prompts.push({ text: "What should I focus on this afternoon?", icon: CheckCircle2 });
  }
  if (reminders.length === 0 && prompts.length < 3) {
    prompts.push({ text: "Remind me about something", icon: Bell });
  }
  if (hour >= 15 && hour < 20 && prompts.length < 3) {
    prompts.push({ text: "Check the grocery list", icon: ListTodo });
  }
  if (hour >= 10 && hour < 15 && prompts.length < 3) {
    prompts.push({ text: "Plan my week", icon: ListTodo });
  }
  if (hour >= 21 || hour < 5) {
    prompts.push({ text: "Add something to my notes", icon: Clock });
  }
  return prompts.slice(0, 3);
}

function EmptyState({ onSendMessage }: { onSendMessage: (message: string) => void }) {
  const { data: reminders = [], isLoading: remindersLoading, isError: remindersError } = useQuery<Reminder[]>({
    queryKey: ["/api/reminders/pending"],
  });
  const { data: allTasks = [], isLoading: tasksLoading, isError: tasksError } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const relevantTasks = allTasks.filter(task => {
    if (task.completed || !task.dueDate) return false;
    const dueDate = parseISO(task.dueDate);
    return isToday(dueDate) || isPast(dueDate);
  });

  const upcomingReminders = reminders.slice(0, 3);
  const incompleteTasks = allTasks.filter(t => !t.completed);
  const smartPrompts = generateSmartPrompts(reminders, incompleteTasks);
  const personalizedSubtitle = getPersonalizedSubtitle(allTasks, reminders);

  const isLoading = remindersLoading || tasksLoading;
  const hasError = remindersError || tasksError;
  const hasNotifications = upcomingReminders.length > 0 || relevantTasks.length > 0;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col items-center py-8 sm:py-10 md:py-12 px-4 sm:px-6 max-w-2xl mx-auto gap-6 sm:gap-8" data-testid="empty-state">
        <div className="flex flex-col items-center gap-2 sm:gap-3 text-center">
          <div className="h-16 w-16 sm:h-18 sm:w-18 md:h-20 md:w-20 rounded-full bg-primary/10 flex items-center justify-center shadow-lg">
            <span className="text-3xl sm:text-4xl md:text-5xl font-bold text-primary">Z</span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight mt-2" data-testid="empty-state-title">
            {getTimeGreeting()}
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground" data-testid="empty-state-subtitle">
            {personalizedSubtitle}
          </p>
        </div>

        {isLoading && (
          <div className="w-full space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        )}

        {!isLoading && hasError && (
          <Card className="w-full p-4 border-destructive/50 bg-destructive/5">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">Couldn't load everything</p>
                <p className="text-xs text-muted-foreground mt-0.5">I'm still here to help — just ask</p>
              </div>
            </div>
          </Card>
        )}

        {!isLoading && !hasError && hasNotifications && (
          <div className="w-full space-y-3" data-testid="notification-cards">
            {upcomingReminders.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">Coming Up</h3>
                {upcomingReminders.map((reminder) => (
                  <Card 
                    key={reminder.id} 
                    className="p-3 flex items-start gap-3 hover-elevate cursor-pointer"
                    onClick={() => onSendMessage(`Tell me about my reminder: "${reminder.message}"`)}
                    data-testid={`reminder-card-${reminder.id}`}
                  >
                    <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                      <Bell className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{reminder.message}</p>
                      <p className="text-xs text-muted-foreground">{formatReminderTime(reminder.scheduledFor)}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Card>
                ))}
              </div>
            )}

            {relevantTasks.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">On Your Radar</h3>
                {relevantTasks.slice(0, 3).map((task) => {
                  const isOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && !isToday(parseISO(task.dueDate));
                  return (
                    <Card 
                      key={task.id} 
                      className="p-3 flex items-start gap-3 hover-elevate cursor-pointer"
                      onClick={() => onSendMessage(`Help me with my task: "${task.title}"`)}
                      data-testid={`task-card-${task.id}`}
                    >
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${isOverdue ? "bg-destructive/10" : "bg-blue-500/10"}`}>
                        {isOverdue ? <AlertCircle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-blue-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <p className={`text-xs ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
                          {formatTaskDue(task.dueDate)} • {task.priority} priority
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!isLoading && !hasError && !hasNotifications && (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">All clear — nothing urgent right now</p>
          </div>
        )}

        <div className="w-full space-y-2" data-testid="smart-prompts">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 text-center">Quick Actions</h3>
          <div className="flex flex-col gap-2">
            {smartPrompts.map((prompt, index) => (
              <Button
                key={index}
                variant="outline"
                className="w-full justify-start gap-3 h-11 text-left"
                onClick={() => onSendMessage(prompt.text)}
                data-testid={`smart-prompt-${index}`}
              >
                <prompt.icon className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate">{prompt.text}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

function ChatSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className={`flex gap-3 ${i % 2 === 0 ? "flex-row-reverse" : ""}`}>
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <Skeleton className={`h-16 rounded-lg ${i % 2 === 0 ? "w-48" : "w-64"}`} />
        </div>
      ))}
    </div>
  );
}

interface AttachedFile {
  id: string;
  file: UploadedFile;
  previewUrl?: string;
}

export default function ChatPage() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [historyOpen, setHistoryOpen] = useState(true);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [messageCards, setMessageCards] = useState<Record<string, ChatCard[]>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  // Voice recording
  const voiceRecorder = useVoiceRecorder();

  const { data: conversations, isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: messagesData, isLoading: messagesLoading } = useQuery<{ conversation: Conversation; messages: Message[] }>({
    queryKey: ["/api/conversations", activeConversationId],
    enabled: !!activeConversationId,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { message: string; conversationId?: string; fileIds?: string[] }) => {
      const response = await apiRequest("POST", "/api/chat", {
        message: data.message,
        conversationId: data.conversationId,
        source: "web",
        fileIds: data.fileIds,
      });
      const result: ChatResponse = await response.json();
      if (!result?.conversation?.id || !result?.message?.id) {
        throw new Error("Invalid response from server");
      }
      return result;
    },
    onSuccess: (data) => {
      if (data?.conversation?.id) {
        setActiveConversationId(data.conversation.id);
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
        queryClient.invalidateQueries({ queryKey: ["/api/conversations", data.conversation.id] });
        
        // Store cards associated with this message
        if (data.cards && data.cards.length > 0 && data.message?.id) {
          setMessageCards(prev => ({
            ...prev,
            [data.message.id]: data.cards as ChatCard[]
          }));
        }
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send message",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/conversations/${id}`);
    },
    onSuccess: () => {
      if (activeConversationId) {
        setActiveConversationId(null);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete conversation",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const gettingToKnowMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/conversations/getting-to-know");
      const result: ChatResponse = await response.json();
      return result;
    },
    onSuccess: (data) => {
      if (data?.conversation?.id) {
        setActiveConversationId(data.conversation.id);
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
        queryClient.invalidateQueries({ queryKey: ["/api/conversations", data.conversation.id] });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to start Getting To Know You",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: async (file: File): Promise<UploadedFile> => {
      setUploadProgress(0);
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch("/api/files", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Upload failed");
      }
      
      setUploadProgress(100);
      return response.json();
    },
    onSuccess: (uploadedFile) => {
      const previewUrl = uploadedFile.mimeType.startsWith("image/") 
        ? `/api/files/${uploadedFile.id}/content`
        : undefined;
      
      setAttachedFiles(prev => [...prev, {
        id: uploadedFile.id,
        file: uploadedFile,
        previewUrl,
      }]);
      setUploadProgress(null);
    },
    onError: (error: Error) => {
      setUploadProgress(null);
      toast({
        title: "Failed to upload file",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const transcribeMutation = useMutation({
    mutationFn: async (data: { audio: string; mimeType: string }): Promise<{ text: string }> => {
      const response = await apiRequest("POST", "/api/transcribe", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.text) {
        setInputValue(prev => prev ? `${prev} ${data.text}` : data.text);
        textareaRef.current?.focus();
      } else {
        toast({
          title: "No speech detected",
          description: "Try speaking more clearly or for longer",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Transcription failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleVoiceButtonClick = async () => {
    if (voiceRecorder.isRecording) {
      const recordingData = await voiceRecorder.stopRecording();
      if (recordingData?.recordDataBase64) {
        transcribeMutation.mutate({
          audio: recordingData.recordDataBase64,
          mimeType: recordingData.mimeType || "audio/webm",
        });
      }
    } else {
      const started = await voiceRecorder.startRecording();
      if (!started && voiceRecorder.error) {
        toast({
          title: "Microphone access denied",
          description: voiceRecorder.error,
          variant: "destructive",
        });
      }
    }
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    const maxSize = 20 * 1024 * 1024;
    
    Array.from(files).forEach(file => {
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Only images (JPG, PNG, GIF, WebP) and PDFs are allowed",
          variant: "destructive",
        });
        return;
      }
      
      if (file.size > maxSize) {
        toast({
          title: "File too large",
          description: "Maximum file size is 20MB",
          variant: "destructive",
        });
        return;
      }
      
      uploadFileMutation.mutate(file);
    });
  };

  const handleRemoveFile = (fileId: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesData?.messages, sendMessageMutation.isPending]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + "px";
    }
  }, [inputValue]);

  const handleSend = () => {
    const hasContent = inputValue.trim() || attachedFiles.length > 0;
    if (!hasContent || sendMessageMutation.isPending || uploadFileMutation.isPending) return;
    
    const fileIds = attachedFiles.map(f => f.id);
    const messageText = attachedFiles.length > 0 && !inputValue.trim()
      ? `I've attached ${attachedFiles.length} file${attachedFiles.length > 1 ? 's' : ''} for you to analyze.`
      : inputValue.trim();
    
    sendMessageMutation.mutate({
      message: messageText,
      conversationId: activeConversationId || undefined,
      fileIds: fileIds.length > 0 ? fileIds : undefined,
    });
    setInputValue("");
    setAttachedFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setActiveConversationId(null);
    setInputValue("");
    setAttachedFiles([]);
  };

  const messages = messagesData?.messages || [];

  return (
    <div className="flex h-full" data-testid="chat-page">
      <aside className="hidden md:flex w-[240px] lg:w-[260px] border-r flex-col bg-sidebar">
        <div className="p-2 sm:p-3 border-b">
          <Button onClick={handleNewChat} className="w-full gap-2" data-testid="button-new-chat">
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>

        <div className="p-2 sm:p-3 space-y-1">
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-2 sm:gap-3 h-9 sm:h-10"
            onClick={() => gettingToKnowMutation.mutate()}
            disabled={gettingToKnowMutation.isPending}
            data-testid="button-getting-to-know"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs sm:text-sm">Getting To Know You</span>
          </Button>
        </div>

        <div className="flex-1 overflow-hidden">
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="px-2 sm:px-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between h-8 sm:h-9 text-muted-foreground mb-1" data-testid="button-toggle-history">
                <div className="flex items-center gap-2">
                  <History className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="text-xs">History</span>
                  {conversations && conversations.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">{conversations.length}</Badge>
                  )}
                </div>
                <ChevronDown className={`h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="space-y-1 pr-2">
                  {conversationsLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
                    </div>
                  ) : conversations?.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No history yet</p>
                  ) : (
                    conversations?.map((conv) => (
                      <ConversationItem
                        key={conv.id}
                        conversation={conv}
                        isActive={conv.id === activeConversationId}
                        onClick={() => setActiveConversationId(conv.id)}
                        onDelete={() => deleteConversationMutation.mutate(conv.id)}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 sm:h-14 border-b flex items-center justify-between gap-2 px-4 sm:px-4 shrink-0 safe-area-inset-top">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <h1 className="text-base sm:text-lg font-semibold truncate">
              {messagesData?.conversation?.title || "Chat with ZEKE"}
            </h1>
            {messagesData?.conversation?.mode === "getting_to_know" && (
              <Badge variant="secondary" className="gap-1 text-[10px] sm:text-xs" data-testid="badge-getting-to-know">
                <Sparkles className="h-3 w-3 sm:h-3 sm:w-3" />
                <span className="hidden sm:inline">Learning</span>
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <PendantStatusBadge />
            <div className="md:hidden">
              <Button size="icon" variant="ghost" onClick={handleNewChat} className="h-10 w-10" data-testid="button-new-chat-mobile">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          {!activeConversationId && !sendMessageMutation.isPending ? (
            <EmptyState onSendMessage={(message) => {
              sendMessageMutation.mutate({ message });
            }} />
          ) : (
            <ScrollArea className="h-full">
              <div className="py-3 sm:py-4">
                {messagesLoading ? (
                  <ChatSkeleton />
                ) : (
                  <>
                    {messages.map((msg) => (
                      <div key={msg.id}>
                        <MessageBubble message={msg} />
                        {msg.role === "assistant" && messageCards[msg.id] && (
                          <CardsDisplay cards={messageCards[msg.id]} />
                        )}
                      </div>
                    ))}
                    {sendMessageMutation.isPending && <TypingIndicator />}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
          )}
        </div>

        <div 
          className={`p-3 sm:p-4 md:p-4 border-t bg-background/95 backdrop-blur-sm shrink-0 safe-area-inset-bottom transition-colors ${isDragging ? "bg-primary/5 border-primary" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
            data-testid="input-file"
          />
          
          <div className="max-w-4xl mx-auto space-y-2">
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2" data-testid="attached-files">
                {attachedFiles.map((attached) => (
                  <div 
                    key={attached.id}
                    className="relative group flex items-center gap-2 bg-accent rounded-lg p-2 pr-8"
                    data-testid={`attached-file-${attached.id}`}
                  >
                    {attached.previewUrl ? (
                      <img 
                        src={attached.previewUrl} 
                        alt={attached.file.originalName}
                        className="h-10 w-10 object-cover rounded"
                      />
                    ) : (
                      <div className="h-10 w-10 bg-muted rounded flex items-center justify-center">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 max-w-[120px]">
                      <p className="text-xs font-medium truncate">{attached.file.originalName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {(attached.file.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleRemoveFile(attached.id)}
                      data-testid={`remove-file-${attached.id}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            
            {uploadProgress !== null && (
              <div className="flex items-center gap-2" data-testid="upload-progress">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <Progress value={uploadProgress} className="flex-1 h-2" />
                <span className="text-xs text-muted-foreground">Uploading...</span>
              </div>
            )}
            
            <div className="flex items-end gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={sendMessageMutation.isPending || uploadFileMutation.isPending || voiceRecorder.isRecording}
                className="h-12 w-12 rounded-full shrink-0"
                data-testid="button-attach"
              >
                <Paperclip className="h-5 w-5" />
              </Button>
              
              <Button
                size="icon"
                variant={voiceRecorder.isRecording ? "destructive" : "ghost"}
                onClick={handleVoiceButtonClick}
                disabled={sendMessageMutation.isPending || transcribeMutation.isPending || voiceRecorder.recordingState === "processing" || voiceRecorder.recordingState === "requesting_permission"}
                className={`h-12 w-12 rounded-full shrink-0 transition-all ${voiceRecorder.isRecording ? "animate-pulse" : ""}`}
                data-testid="button-voice"
              >
                {voiceRecorder.recordingState === "processing" || transcribeMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : voiceRecorder.isRecording ? (
                  <Square className="h-5 w-5" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
              </Button>
              
              <div className="flex-1 relative">
                <Textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={voiceRecorder.isRecording ? `Recording... ${voiceRecorder.duration}s` : isDragging ? "Drop files here..." : "Message ZEKE..."}
                  className="min-h-[48px] max-h-[140px] sm:max-h-[160px] resize-none text-base py-3 px-4 rounded-xl border-2 focus:border-primary transition-colors"
                  rows={1}
                  disabled={sendMessageMutation.isPending || voiceRecorder.isRecording}
                  data-testid="input-message"
                />
              </div>
              <Button
                size="icon"
                onClick={handleSend}
                disabled={(!inputValue.trim() && attachedFiles.length === 0) || sendMessageMutation.isPending || uploadFileMutation.isPending || voiceRecorder.isRecording}
                className="h-12 w-12 rounded-full shrink-0 shadow-lg hover:shadow-xl transition-shadow"
                data-testid="button-send"
              >
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2 hidden sm:block">
            ZEKE can make mistakes. Consider checking important info.
          </p>
        </div>
      </main>
    </div>
  );
}
