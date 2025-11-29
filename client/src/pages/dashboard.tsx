import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from "wouter";
import {
  MessageSquare,
  ListTodo,
  ShoppingCart,
  Brain,
  Users,
  Zap,
  Phone,
  User,
  Plus,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  Calendar,
  MapPin,
} from "lucide-react";
import type { Task, GroceryItem, MemoryNote, Conversation } from "@shared/schema";
import { format, isPast, isToday, parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay: boolean;
}

type DashboardStats = {
  tasks: {
    total: number;
    pending: number;
    dueToday: number;
    overdue: number;
  };
  grocery: {
    total: number;
    purchased: number;
  };
  memories: {
    total: number;
    recentCount: number;
  };
  conversations: {
    total: number;
    recentCount: number;
  };
  contacts: {
    total: number;
  };
  automations: {
    total: number;
    enabled: number;
  };
};

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  href,
  variant = "default",
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: typeof ListTodo;
  href: string;
  variant?: "default" | "warning" | "success";
}) {
  const variantClasses = {
    default: "",
    warning: "border-yellow-500/30",
    success: "border-green-500/30",
  };

  return (
    <Link href={href}>
      <Card className={`hover-elevate cursor-pointer transition-all ${variantClasses[variant]}`} data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, "-")}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className="text-2xl font-semibold mt-1" data-testid={`stat-value-${title.toLowerCase().replace(/\s+/g, "-")}`}>{value}</p>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
              )}
            </div>
            <div className="p-3 rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function FeatureCard({
  title,
  description,
  icon: Icon,
  href,
  badge,
  action,
}: {
  title: string;
  description: string;
  icon: typeof ListTodo;
  href: string;
  badge?: { text: string; variant?: "default" | "secondary" | "destructive" };
  action?: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover-elevate cursor-pointer h-full" data-testid={`feature-card-${title.toLowerCase().replace(/\s+/g, "-")}`}>
        <CardContent className="p-4 h-full flex flex-col">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-accent">
              <Icon className="h-5 w-5 text-accent-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium text-sm">{title}</h3>
                {badge && (
                  <Badge variant={badge.variant || "secondary"} className="text-[10px]">
                    {badge.text}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {description}
              </p>
            </div>
          </div>
          {action && (
            <div className="flex items-center gap-1 text-xs text-primary mt-3 pt-3 border-t">
              <span>{action}</span>
              <ArrowRight className="h-3 w-3" />
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function TaskPreview({ tasks }: { tasks: Task[] }) {
  const urgentTasks = tasks
    .filter((t) => !t.completed)
    .sort((a, b) => {
      if (a.priority === "high" && b.priority !== "high") return -1;
      if (b.priority === "high" && a.priority !== "high") return 1;
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      return 0;
    })
    .slice(0, 4);

  if (urgentTasks.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>All caught up!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {urgentTasks.map((task) => {
        const isOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && !isToday(parseISO(task.dueDate));
        const isDueToday = task.dueDate && isToday(parseISO(task.dueDate));

        return (
          <div
            key={task.id}
            className="flex items-center gap-3 p-2 rounded-lg border hover-elevate"
            data-testid={`task-preview-${task.id}`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                task.priority === "high"
                  ? "bg-red-500"
                  : task.priority === "medium"
                  ? "bg-yellow-500"
                  : "bg-green-500"
              }`}
            />
            <span className="flex-1 text-sm truncate">{task.title}</span>
            {isOverdue && (
              <Badge variant="destructive" className="text-[10px]">
                Overdue
              </Badge>
            )}
            {isDueToday && !isOverdue && (
              <Badge variant="secondary" className="text-[10px]">
                Today
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}

function GroceryPreview({ items }: { items: GroceryItem[] }) {
  const unpurchased = items.filter((item) => !item.purchased).slice(0, 5);

  if (unpurchased.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Shopping list is empty</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {unpurchased.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 p-2 rounded-lg border hover-elevate"
          data-testid={`grocery-preview-${item.id}`}
        >
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span className="flex-1 text-sm truncate">{item.name}</span>
          <Badge variant="secondary" className="text-[10px]">
            {item.category}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function CalendarPreview({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No events today</p>
      </div>
    );
  }

  const sortedEvents = [...events].sort((a, b) => {
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });

  return (
    <div className="space-y-2">
      {sortedEvents.slice(0, 4).map((event) => (
        <div
          key={event.id}
          className="flex items-start gap-3 p-2 rounded-lg border hover-elevate"
          data-testid={`calendar-preview-${event.id}`}
        >
          <div className="p-1.5 rounded bg-primary/10 mt-0.5">
            <Clock className="h-3 w-3 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{event.summary}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              {event.allDay ? (
                <span>All day</span>
              ) : (
                <span>{format(parseISO(event.start), "h:mm a")}</span>
              )}
              {event.location && (
                <>
                  <span>·</span>
                  <span className="truncate">{event.location}</span>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { data: tasks, isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: groceryItems, isLoading: groceryLoading } = useQuery<GroceryItem[]>({
    queryKey: ["/api/grocery"],
  });

  const { data: memories, isLoading: memoriesLoading } = useQuery<MemoryNote[]>({
    queryKey: ["/api/memory"],
  });

  const { data: conversations, isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: todayEvents, isLoading: calendarLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar/today"],
  });

  const stats: DashboardStats = {
    tasks: {
      total: tasks?.length || 0,
      pending: tasks?.filter((t) => !t.completed).length || 0,
      dueToday: tasks?.filter((t) => t.dueDate && isToday(parseISO(t.dueDate)) && !t.completed).length || 0,
      overdue: tasks?.filter((t) => t.dueDate && isPast(parseISO(t.dueDate)) && !isToday(parseISO(t.dueDate)) && !t.completed).length || 0,
    },
    grocery: {
      total: groceryItems?.length || 0,
      purchased: groceryItems?.filter((i) => i.purchased).length || 0,
    },
    memories: {
      total: memories?.length || 0,
      recentCount: memories?.filter((m) => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return new Date(m.createdAt) > weekAgo;
      }).length || 0,
    },
    conversations: {
      total: conversations?.length || 0,
      recentCount: conversations?.filter((c) => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return new Date(c.updatedAt) > weekAgo;
      }).length || 0,
    },
    contacts: { total: 0 },
    automations: { total: 0, enabled: 0 },
  };

  const isLoading = tasksLoading || groceryLoading || memoriesLoading || conversationsLoading || calendarLoading;

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold" data-testid="text-greeting">
            {getTimeGreeting()}, Nate
          </h1>
          <p className="text-muted-foreground text-sm">
            Here's what's happening with ZEKE today
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-[100px]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard
              title="Today's Events"
              value={todayEvents?.length || 0}
              subtitle={todayEvents && todayEvents.length > 0 ? `Next: ${todayEvents[0]?.summary?.substring(0, 15)}...` : "No events"}
              icon={Calendar}
              href="/calendar"
            />
            <StatCard
              title="Pending Tasks"
              value={stats.tasks.pending}
              subtitle={stats.tasks.overdue > 0 ? `${stats.tasks.overdue} overdue` : stats.tasks.dueToday > 0 ? `${stats.tasks.dueToday} due today` : undefined}
              icon={ListTodo}
              href="/tasks"
              variant={stats.tasks.overdue > 0 ? "warning" : "default"}
            />
            <StatCard
              title="Grocery Items"
              value={stats.grocery.total - stats.grocery.purchased}
              subtitle={`${stats.grocery.purchased} purchased`}
              icon={ShoppingCart}
              href="/grocery"
            />
            <StatCard
              title="Memories"
              value={stats.memories.total}
              subtitle={`${stats.memories.recentCount} this week`}
              icon={Brain}
              href="/memory"
            />
            <StatCard
              title="Conversations"
              value={stats.conversations.total}
              subtitle={`${stats.conversations.recentCount} recent`}
              icon={MessageSquare}
              href="/chat"
            />
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <CardTitle className="text-base font-medium">Today's Schedule</CardTitle>
              <Link href="/calendar">
                <Button size="sm" variant="ghost" data-testid="button-view-all-calendar">
                  View all
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {calendarLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : (
                <CalendarPreview events={todayEvents || []} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <CardTitle className="text-base font-medium">Tasks</CardTitle>
              <Link href="/tasks">
                <Button size="sm" variant="ghost" data-testid="button-view-all-tasks">
                  View all
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {tasksLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : (
                <TaskPreview tasks={tasks || []} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <CardTitle className="text-base font-medium">Grocery List</CardTitle>
              <Link href="/grocery">
                <Button size="sm" variant="ghost" data-testid="button-view-all-grocery">
                  View all
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {groceryLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : (
                <GroceryPreview items={groceryItems || []} />
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-lg font-medium mb-4">Quick Access</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <FeatureCard
              title="Chat with ZEKE"
              description="Ask questions, get help, or just chat"
              icon={MessageSquare}
              href="/chat"
              action="Start chatting"
            />
            <FeatureCard
              title="Calendar"
              description="View and manage your schedule"
              icon={Calendar}
              href="/calendar"
              action="View calendar"
            />
            <FeatureCard
              title="Getting To Know You"
              description="Help ZEKE understand you better"
              icon={Sparkles}
              href="/profile"
              action="Update profile"
            />
            <FeatureCard
              title="Contacts"
              description="Manage SMS access and permissions"
              icon={Users}
              href="/contacts"
              action="View contacts"
            />
            <FeatureCard
              title="Automations"
              description="Scheduled tasks and reminders"
              icon={Zap}
              href="/automations"
              action="Manage automations"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <FeatureCard
            title="SMS Log"
            description="View all SMS activity and conversations"
            icon={Phone}
            href="/sms-log"
            action="View log"
          />
          <FeatureCard
            title="ZEKE's Memory"
            description="What ZEKE knows about you"
            icon={Brain}
            href="/memory"
            badge={{ text: `${stats.memories.total} memories` }}
            action="View memories"
          />
        </div>
      </div>
    </div>
  );
}
