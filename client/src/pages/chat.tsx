import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  Send, 
  Plus, 
  MessageSquare, 
  Trash2, 
  Menu,
  X,
  Smartphone,
  ShoppingCart,
  ListTodo,
  Sparkles,
  History,
  ChevronDown,
  Brain,
  Settings,
  Bell,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight
} from "lucide-react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import type { Conversation, Message, ChatResponse, Reminder, Task } from "@shared/schema";
import { format, isToday, isTomorrow, isPast, parseISO } from "date-fns";

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3" data-testid="typing-indicator">
      <Avatar className="h-7 w-7 md:h-8 md:w-8 shrink-0">
        <AvatarFallback className="bg-primary text-primary-foreground text-xs md:text-sm font-semibold">
          Z
        </AvatarFallback>
      </Avatar>
      <div className="bg-accent rounded-lg px-3 md:px-4 py-2 md:py-3">
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isSms = message.source === "sms";
  
  return (
    <div 
      className={`flex items-start gap-2 md:gap-3 px-3 md:px-4 py-1.5 md:py-2 ${isUser ? "flex-row-reverse" : ""}`}
      data-testid={`message-${message.id}`}
    >
      <Avatar className="h-7 w-7 md:h-8 md:w-8 shrink-0">
        <AvatarFallback 
          className={`text-xs md:text-sm font-semibold ${
            isUser 
              ? "bg-accent text-accent-foreground" 
              : "bg-primary text-primary-foreground"
          }`}
        >
          {isUser ? "NJ" : "Z"}
        </AvatarFallback>
      </Avatar>
      
      <div className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isUser ? "items-end" : "items-start"}`}>
        <div 
          className={`rounded-lg px-3 md:px-4 py-2 md:py-3 relative ${
            isUser 
              ? "bg-primary text-primary-foreground" 
              : "bg-accent text-accent-foreground"
          }`}
        >
          {isSms && (
            <div 
              className={`absolute -top-1 ${isUser ? "-left-1" : "-right-1"} flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground text-[9px] md:text-[10px]`}
              data-testid={`sms-badge-${message.id}`}
            >
              <Smartphone className="h-2 w-2 md:h-2.5 md:w-2.5" />
              <span>SMS</span>
            </div>
          )}
          <p className="text-[13px] md:text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
        </div>
        <span className="text-[10px] md:text-[11px] text-muted-foreground mt-1 px-1">
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
      className={`group relative flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer transition-colors hover-elevate ${
        isActive ? "bg-sidebar-accent" : ""
      }`}
      onClick={onClick}
      data-testid={`conversation-${conversation.id}`}
    >
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary rounded-r" />
      )}
      <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{conversation.title}</p>
        <p className="text-[11px] text-muted-foreground">
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
  const hasFamilyTasks = tasks.some(t => t.category === "family" && !t.completed);
  const hasWorkTasks = tasks.some(t => t.category === "work" && !t.completed);
  const overdueCount = tasks.filter(t => 
    t.dueDate && !t.completed && isPast(parseISO(t.dueDate)) && !isToday(parseISO(t.dueDate))
  ).length;
  
  // Early morning
  if (hour >= 5 && hour < 9) {
    return "Let's get your day started";
  }
  
  // If there are overdue items
  if (overdueCount > 0) {
    return overdueCount === 1 
      ? "You have 1 item that needs attention" 
      : `You have ${overdueCount} items that need attention`;
  }
  
  // Mid-morning work time
  if (hour >= 9 && hour < 12) {
    if (hasWorkTasks) return "Here's what's on your plate today";
    return "Ready when you are";
  }
  
  // Afternoon
  if (hour >= 12 && hour < 17) {
    if (hasFamilyTasks) return "Don't forget about the family items";
    return "How's the day going?";
  }
  
  // Evening
  if (hour >= 17 && hour < 21) {
    return "Time to wind down";
  }
  
  // Late night
  return "Still working? I'm here if you need me";
}

function formatReminderTime(scheduledFor: string): string {
  const date = parseISO(scheduledFor);
  if (isToday(date)) {
    return `Today at ${format(date, "h:mm a")}`;
  }
  if (isTomorrow(date)) {
    return `Tomorrow at ${format(date, "h:mm a")}`;
  }
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
  
  // Categorize tasks
  const familyTasks = tasks.filter(t => t.category === "family" && !t.completed);
  const workTasks = tasks.filter(t => t.category === "work" && !t.completed);
  const overdueCount = tasks.filter(t => 
    t.dueDate && !t.completed && isPast(parseISO(t.dueDate)) && !isToday(parseISO(t.dueDate))
  ).length;

  // Morning briefing - a key ZEKE feature
  if (hour >= 5 && hour < 11) {
    prompts.push({ text: "Give me my morning briefing", icon: Calendar });
  }

  // Overdue items take priority
  if (overdueCount > 0) {
    prompts.push({ 
      text: `I have ${overdueCount} overdue item${overdueCount > 1 ? 's' : ''} to deal with`, 
      icon: AlertCircle 
    });
  }

  // Family-specific prompts when there are family tasks
  if (familyTasks.length > 0) {
    const familyTaskNames = familyTasks.slice(0, 2).map(t => t.title);
    if (familyTasks.some(t => t.title.toLowerCase().includes('aurora') || t.title.toLowerCase().includes('carolina'))) {
      prompts.push({ text: "What do I need to do for the girls?", icon: ListTodo });
    } else {
      prompts.push({ text: "Show me my family to-dos", icon: ListTodo });
    }
  }

  // Work/business prompts
  if (workTasks.length > 0 && hour >= 8 && hour < 18) {
    prompts.push({ text: "What's the priority for Johnson Bros today?", icon: CheckCircle2 });
  }

  // Time-based contextual prompts
  if (hour >= 17 && hour < 21) {
    prompts.push({ text: "Help me plan tomorrow", icon: Calendar });
  } else if (hour >= 11 && hour < 14) {
    prompts.push({ text: "What should I focus on this afternoon?", icon: CheckCircle2 });
  }

  // Reminder prompts
  if (reminders.length === 0 && prompts.length < 3) {
    prompts.push({ text: "Remind me about something", icon: Bell });
  }

  // Grocery/family life prompt if afternoon/evening
  if (hour >= 15 && hour < 20 && prompts.length < 3) {
    prompts.push({ text: "Check the grocery list", icon: ListTodo });
  }

  // Late night
  if (hour >= 21 || hour < 5) {
    prompts.push({ text: "Add something to my notes", icon: Clock });
  }

  // Limit to 3 prompts and ensure no duplicates
  return prompts.slice(0, 3);
}

function EmptyState({ onSendMessage }: { onSendMessage: (message: string) => void }) {
  // Fetch pending reminders using default fetcher
  const { 
    data: reminders = [], 
    isLoading: remindersLoading,
    isError: remindersError 
  } = useQuery<Reminder[]>({
    queryKey: ["/api/reminders/pending"],
  });

  // Fetch all incomplete tasks and filter client-side to avoid multiple requests
  const { 
    data: allTasks = [], 
    isLoading: tasksLoading,
    isError: tasksError 
  } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  // Filter tasks client-side for due today and overdue
  const relevantTasks = allTasks.filter(task => {
    if (task.completed || !task.dueDate) return false;
    const dueDate = parseISO(task.dueDate);
    return isToday(dueDate) || isPast(dueDate);
  });

  const upcomingReminders = reminders.slice(0, 3);
  // Use all incomplete tasks for smart prompts (not just due/overdue)
  const incompleteTasks = allTasks.filter(t => !t.completed);
  const smartPrompts = generateSmartPrompts(reminders, incompleteTasks);
  const personalizedSubtitle = getPersonalizedSubtitle(allTasks, reminders);

  const isLoading = remindersLoading || tasksLoading;
  const hasError = remindersError || tasksError;
  const hasNotifications = upcomingReminders.length > 0 || relevantTasks.length > 0;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col items-center py-6 md:py-10 px-4 max-w-2xl mx-auto gap-6 md:gap-8" data-testid="empty-state">
        {/* Header with greeting */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="h-14 w-14 md:h-16 md:w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-2xl md:text-3xl font-bold text-primary">Z</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-2" data-testid="empty-state-title">
            {getTimeGreeting()}
          </h1>
          <p className="text-muted-foreground text-sm md:text-base" data-testid="empty-state-subtitle">
            {personalizedSubtitle}
          </p>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="w-full space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        )}

        {/* Error State */}
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

        {/* Notification Cards */}
        {!isLoading && !hasError && hasNotifications && (
          <div className="w-full space-y-3" data-testid="notification-cards">
            {/* Upcoming Reminders */}
            {upcomingReminders.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                  Coming Up
                </h3>
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

            {/* Tasks Due Today / Overdue */}
            {relevantTasks.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                  On Your Radar
                </h3>
                {relevantTasks.slice(0, 3).map((task) => {
                  const isOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && !isToday(parseISO(task.dueDate));
                  return (
                    <Card 
                      key={task.id} 
                      className="p-3 flex items-start gap-3 hover-elevate cursor-pointer"
                      onClick={() => onSendMessage(`Help me with my task: "${task.title}"`)}
                      data-testid={`task-card-${task.id}`}
                    >
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                        isOverdue ? "bg-destructive/10" : "bg-blue-500/10"
                      }`}>
                        {isOverdue ? (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-blue-500" />
                        )}
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

        {/* No notifications message */}
        {!isLoading && !hasError && !hasNotifications && (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">All clear — nothing urgent right now</p>
          </div>
        )}

        {/* Smart Prompts */}
        <div className="w-full space-y-2" data-testid="smart-prompts">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 text-center">
            Quick Actions
          </h3>
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

export default function ChatPage() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  
  // Open sidebar by default on desktop
  useEffect(() => {
    if (!isMobile) {
      setSidebarOpen(true);
    }
  }, [isMobile]);

  // Fetch conversations
  const { data: conversations, isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  // Fetch messages for active conversation
  const { data: messagesData, isLoading: messagesLoading } = useQuery<{ conversation: Conversation; messages: Message[] }>({
    queryKey: ["/api/conversations", activeConversationId],
    enabled: !!activeConversationId,
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (data: { message: string; conversationId?: string }) => {
      const response = await apiRequest("POST", "/api/chat", {
        message: data.message,
        conversationId: data.conversationId,
        source: "web",
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

  // Delete conversation mutation
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

  // Getting To Know You conversation mutation
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
        if (isMobile) {
          setSidebarOpen(false);
        }
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

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesData?.messages, sendMessageMutation.isPending]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + "px";
    }
  }, [inputValue]);

  const handleSend = () => {
    if (!inputValue.trim() || sendMessageMutation.isPending) return;
    
    sendMessageMutation.mutate({
      message: inputValue.trim(),
      conversationId: activeConversationId || undefined,
    });
    setInputValue("");
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
  };

  const messages = messagesData?.messages || [];
  
  const handleConversationSelect = (convId: string) => {
    setActiveConversationId(convId);
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleNewChatWithSidebarClose = () => {
    handleNewChat();
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="flex h-screen h-[100dvh] bg-background" data-testid="chat-page">
      {/* Mobile sidebar overlay backdrop */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
          data-testid="sidebar-backdrop"
        />
      )}
      
      {/* Sidebar - Fixed overlay on mobile, inline on desktop */}
      <aside 
        className={`
          ${isMobile 
            ? `fixed inset-y-0 left-0 z-50 w-[280px] transform transition-transform duration-200 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}` 
            : `${sidebarOpen ? "w-[280px]" : "w-0"} transition-all duration-200 overflow-hidden shrink-0`
          }
          bg-sidebar border-r border-sidebar-border flex flex-col
        `}
        data-testid="sidebar"
      >
        { /* Sidebar Header */ }
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-lg font-bold text-primary">Z</span>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold">ZEKE</h2>
              <p className="text-[11px] text-muted-foreground">Your Personal AI</p>
            </div>
            {isMobile && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setSidebarOpen(false)}
                className="h-9 w-9 shrink-0"
                data-testid="button-close-sidebar"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Button 
            onClick={handleNewChatWithSidebarClose} 
            className="w-full gap-2 h-10"
            data-testid="button-new-chat"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>
        
        { /* Main Actions */ }
        <div className="flex-1 p-3 space-y-1">
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 h-11"
            onClick={() => gettingToKnowMutation.mutate()}
            disabled={gettingToKnowMutation.isPending}
            data-testid="button-getting-to-know"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            <div className="flex flex-col items-start">
              <span className="text-sm">Getting To Know You</span>
              <span className="text-[10px] text-muted-foreground">Help ZEKE understand you</span>
            </div>
          </Button>
          
          <Link href="/grocery">
            <Button 
              variant="ghost" 
              className="w-full justify-start gap-3 h-11"
              data-testid="link-grocery-list"
            >
              <ShoppingCart className="h-4 w-4 text-green-500" />
              <div className="flex flex-col items-start">
                <span className="text-sm">Grocery List</span>
                <span className="text-[10px] text-muted-foreground">Shared family list</span>
              </div>
            </Button>
          </Link>
          
          <Link href="/tasks">
            <Button 
              variant="ghost" 
              className="w-full justify-start gap-3 h-11"
              data-testid="link-tasks"
            >
              <ListTodo className="h-4 w-4 text-blue-500" />
              <div className="flex flex-col items-start">
                <span className="text-sm">Tasks</span>
                <span className="text-[10px] text-muted-foreground">Manage your to-dos</span>
              </div>
            </Button>
          </Link>
          
          <Link href="/memory">
            <Button 
              variant="ghost" 
              className="w-full justify-start gap-3 h-11"
              data-testid="link-memory"
            >
              <Brain className="h-4 w-4 text-purple-500" />
              <div className="flex flex-col items-start">
                <span className="text-sm">ZEKE's Memory</span>
                <span className="text-[10px] text-muted-foreground">What ZEKE knows about you</span>
              </div>
            </Button>
          </Link>
          
          <Link href="/contacts">
            <Button 
              variant="ghost" 
              className="w-full justify-start gap-3 h-11"
              data-testid="link-contacts"
            >
              <Smartphone className="h-4 w-4 text-orange-500" />
              <div className="flex flex-col items-start">
                <span className="text-sm">Contacts</span>
                <span className="text-[10px] text-muted-foreground">Manage SMS access</span>
              </div>
            </Button>
          </Link>

          { /* Collapsible History Section */ }
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="mt-4">
            <CollapsibleTrigger asChild>
              <Button 
                variant="ghost" 
                className="w-full justify-between gap-2 h-9 text-muted-foreground"
                data-testid="button-toggle-history"
              >
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  <span className="text-xs">Chat History</span>
                  {conversations && conversations.length > 0 && (
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
                      {conversations.length}
                    </span>
                  )}
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1">
              <ScrollArea className="h-[200px]">
                <div className="space-y-1 pr-2">
                  {conversationsLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-10 rounded-lg" />
                      ))}
                    </div>
                  ) : conversations?.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No history yet
                    </p>
                  ) : (
                    conversations?.map((conv) => (
                      <ConversationItem
                        key={conv.id}
                        conversation={conv}
                        isActive={conv.id === activeConversationId}
                        onClick={() => handleConversationSelect(conv.id)}
                        onDelete={() => deleteConversationMutation.mutate(conv.id)}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        </div>

        { /* Profile Section */ }
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover-elevate cursor-pointer">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-accent text-accent-foreground text-sm font-medium">
                NJ
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Nate Johnson</p>
              <p className="text-[10px] text-muted-foreground">CEO, Johnson Bros.</p>
            </div>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header - More compact on mobile */}
        <header className="h-12 md:h-14 border-b border-border flex items-center justify-between px-3 md:px-4 shrink-0">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="h-10 w-10 md:h-9 md:w-9 shrink-0"
              data-testid="button-toggle-sidebar"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-base md:text-lg font-semibold truncate">
              {messagesData?.conversation?.title || "ZEKE"}
            </h1>
            {messagesData?.conversation?.mode === "getting_to_know" && (
              <span 
                className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium"
                data-testid="badge-getting-to-know"
              >
                <Sparkles className="h-3 w-3" />
                Learning
              </span>
            )}
          </div>
        </header>

        {/* Messages area */}
        <div className="flex-1 overflow-hidden">
          {!activeConversationId && !sendMessageMutation.isPending ? (
            <EmptyState onSendMessage={(message) => {
              sendMessageMutation.mutate({ message });
            }} />
          ) : (
            <ScrollArea className="h-full">
              <div className="py-2 md:py-4">
                {messagesLoading ? (
                  <ChatSkeleton />
                ) : (
                  <>
                    {messages.map((msg) => (
                      <MessageBubble key={msg.id} message={msg} />
                    ))}
                    {sendMessageMutation.isPending && <TypingIndicator />}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Input area - Optimized for mobile */}
        <div className="p-2 md:p-4 border-t border-border bg-background/80 backdrop-blur shrink-0 safe-area-inset-bottom">
          <div className="flex items-end gap-2 md:gap-3 max-w-4xl mx-auto">
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message ZEKE..."
                className="min-h-[44px] md:min-h-[48px] max-h-[120px] md:max-h-[150px] resize-none text-[15px] md:text-base py-3 px-3 md:px-4"
                rows={1}
                disabled={sendMessageMutation.isPending}
                data-testid="input-message"
              />
            </div>
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!inputValue.trim() || sendMessageMutation.isPending}
              className="h-11 w-11 md:h-12 md:w-12 rounded-full shrink-0"
              data-testid="button-send"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
          <p className="text-[10px] md:text-[11px] text-muted-foreground text-center mt-1.5 md:mt-2 hidden md:block">
            ZEKE can make mistakes. Consider checking important info.
          </p>
        </div>
      </main>
    </div>
  );
}
