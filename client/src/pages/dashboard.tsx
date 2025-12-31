import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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
  Send,
  Inbox,
  MessagesSquare,
  Maximize2,
  Navigation,
  Star,
  Home,
  Briefcase,
  Coffee,
  Heart,
  MapPinned,
  Lightbulb,
  X,
  Check,
  RefreshCw,
  Bell,
  BellOff,
  Moon,
  Activity,
  DollarSign,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import type { Task, GroceryItem, MemoryNote, Conversation, Message, ChatResponse, NewsStory, NewsTopic } from "@shared/schema";
import { format, isPast, isToday, parseISO, isWithinInterval, startOfDay, endOfDay, formatDistanceToNow } from "date-fns";
import { Newspaper, ExternalLink, AlertTriangle, Settings2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Progress } from "@/components/ui/progress";

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay: boolean;
}

interface SmsStats {
  total: number;
  inbound: number;
  outbound: number;
  failed: number;
  bySource: Record<string, number>;
}

interface SmsConversation {
  phone: string;
  contactName?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  messageCount: number;
}

interface SavedPlace {
  id: string;
  name: string;
  latitude: string;
  longitude: string;
  label?: string;
  address?: string;
  category: string;
  notes?: string;
  isStarred: boolean;
  proximityAlertEnabled: boolean;
  proximityRadiusMeters: number;
  createdAt: string;
}

interface LocationHistory {
  id: string;
  latitude: string;
  longitude: string;
  accuracy?: string;
  source: string;
  createdAt: string;
}

interface Insight {
  id: string;
  type: string;
  category: string;
  title: string;
  content: string;
  priority: "high" | "medium" | "low";
  confidence: number;
  suggestedAction?: string;
  status: "new" | "surfaced" | "snoozed" | "completed" | "dismissed";
  createdAt: string;
}

interface InsightStats {
  total: number;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
}

interface NotificationPreferences {
  id: string;
  enabled: boolean;
  batchingEnabled: boolean;
  batchIntervalMinutes: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  urgentBypassQuietHours: boolean;
  maxBatchSize: number;
}

interface NotificationStatus {
  stats: {
    pending: number;
    sentToday: number;
    byCategory: Record<string, number>;
    byPriority: Record<string, number>;
  };
  preferences: NotificationPreferences;
  isInQuietHours: boolean;
  schedulerActive: boolean;
}

interface AiUsageStats {
  periodStart: string;
  periodEnd: string;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostCents: number;
  averageLatencyMs: number;
  errorCount: number;
  errorRate: number;
  byModel: Record<string, {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
    averageLatencyMs: number;
  }>;
  byAgent: Record<string, { calls: number; costCents: number }>;
  byEndpoint: Record<string, { calls: number; costCents: number }>;
}

interface DailyTrendPoint {
  date: string;
  costCents: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

interface AgentCostBreakdown {
  agentId: string;
  calls: number;
  costCents: number;
  avgLatencyMs: number;
  errorCount: number;
}

interface BudgetPeriod {
  spent: number;
  limit: number;
  percent: number;
  overBudget: boolean;
}

interface BudgetStatus {
  config: {
    dailyLimitCents: number;
    weeklyLimitCents: number;
    monthlyLimitCents: number;
    alertAtPercent: number;
    enabled: boolean;
  };
  status: {
    daily: BudgetPeriod;
    weekly: BudgetPeriod;
    monthly: BudgetPeriod;
    alerts: string[];
  };
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
      <Card className={`hover-elevate cursor-pointer transition-all min-h-[100px] sm:min-h-[110px] ${variantClasses[variant]}`} data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, "-")}`}>
        <CardContent className="p-4 sm:p-5 h-full">
          <div className="flex items-center justify-between gap-3 h-full">
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <p className="text-sm sm:text-base text-muted-foreground truncate font-medium">{title}</p>
              <p className="text-2xl sm:text-3xl font-semibold mt-1" data-testid={`stat-value-${title.toLowerCase().replace(/\s+/g, "-")}`}>{value}</p>
              {subtitle && (
                <p className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">{subtitle}</p>
              )}
            </div>
            <div className="p-3 sm:p-3.5 rounded-xl bg-primary/10 shrink-0">
              <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
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
      <Card className="hover-elevate cursor-pointer h-full min-h-[100px]" data-testid={`feature-card-${title.toLowerCase().replace(/\s+/g, "-")}`}>
        <CardContent className="p-4 sm:p-5 h-full flex flex-col">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-accent shrink-0">
              <Icon className="h-5 w-5 text-accent-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm sm:text-base">{title}</h3>
                {badge && (
                  <Badge variant={badge.variant || "secondary"} className="text-[10px] sm:text-xs">
                    {badge.text}
                  </Badge>
                )}
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2">
                {description}
              </p>
            </div>
          </div>
          {action && (
            <div className="flex items-center gap-1 text-xs sm:text-sm text-primary mt-3 pt-3 border-t font-medium">
              <span>{action}</span>
              <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
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

function CommunicationsWidget({ 
  stats, 
  conversations,
  isLoading 
}: { 
  stats: SmsStats | undefined; 
  conversations: SmsConversation[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="col-span-1 sm:col-span-2">
        <CardHeader className="pb-2 sm:pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-12" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-1 sm:col-span-2" data-testid="widget-communications">
      <CardHeader className="pb-2 sm:pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <MessagesSquare className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm sm:text-base">Communications</CardTitle>
          </div>
          <div className="flex gap-1">
            <Link href="/contacts">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" data-testid="button-view-contacts">
                <Users className="h-3 w-3" />
                <span className="hidden sm:inline">Contacts</span>
              </Button>
            </Link>
            <Link href="/sms-log">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" data-testid="button-view-sms-log">
                <Phone className="h-3 w-3" />
                <span className="hidden sm:inline">SMS Log</span>
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="text-center p-2 sm:p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <Inbox className="h-3 w-3" />
              <span className="text-[10px] sm:text-xs">Received</span>
            </div>
            <p className="text-base sm:text-lg font-semibold" data-testid="stat-sms-inbound">{stats?.inbound || 0}</p>
          </div>
          <div className="text-center p-2 sm:p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <Send className="h-3 w-3" />
              <span className="text-[10px] sm:text-xs">Sent</span>
            </div>
            <p className="text-base sm:text-lg font-semibold" data-testid="stat-sms-outbound">{stats?.outbound || 0}</p>
          </div>
          <div className="text-center p-2 sm:p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <MessageSquare className="h-3 w-3" />
              <span className="text-[10px] sm:text-xs">Total</span>
            </div>
            <p className="text-base sm:text-lg font-semibold" data-testid="stat-sms-total">{stats?.total || 0}</p>
          </div>
        </div>

        {conversations && conversations.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wide">Recent Conversations</p>
            <div className="space-y-1.5">
              {conversations.slice(0, 3).map((conv, index) => (
                <Link key={`${conv.phone}-${index}`} href={`/contacts`}>
                  <div className="flex items-center gap-2 sm:gap-3 p-2 rounded-lg border hover-elevate cursor-pointer" data-testid={`conversation-preview-${conv.phone}`}>
                    <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-accent flex items-center justify-center shrink-0">
                      <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium truncate">{conv.contactName || conv.phone}</p>
                      {conv.lastMessage && (
                        <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{conv.lastMessage}</p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-[9px] sm:text-[10px] shrink-0">{conv.messageCount}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <Phone className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
            <p className="text-xs sm:text-sm">No recent conversations</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getCategoryIcon(category: string) {
  switch (category) {
    case "home": return Home;
    case "work": return Briefcase;
    case "grocery": return ShoppingCart;
    case "restaurant": return Coffee;
    case "healthcare": return Heart;
    default: return MapPinned;
  }
}

function getCategoryColor(category: string): string {
  switch (category) {
    case "home": return "#22c55e";
    case "work": return "#3b82f6";
    case "grocery": return "#f97316";
    case "restaurant": return "#ec4899";
    case "healthcare": return "#ef4444";
    default: return "#8b5cf6";
  }
}

const createCustomIcon = (category: string, isStarred: boolean = false) => {
  const color = getCategoryColor(category);
  const starIndicator = isStarred ? '<span style="position:absolute;top:-3px;right:-3px;font-size:8px;">★</span>' : '';
  
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="position:relative;background:${color};width:20px;height:20px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
      ${starIndicator}
    </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 20],
    popupAnchor: [0, -20]
  });
};

const currentLocationIcon = L.divIcon({
  className: 'current-location-marker',
  html: `<div style="background:#3b82f6;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 0 0 2px #3b82f6,0 1px 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

function MapCenterController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (center[0] !== 0 && center[1] !== 0) {
      map.setView(center, 13);
    }
  }, [center, map]);
  return null;
}

function getLocationStatus(lastUpdate: string | undefined): { status: string; color: string } {
  if (!lastUpdate) return { status: "No GPS", color: "text-muted-foreground" };
  
  const now = new Date();
  const updateTime = new Date(lastUpdate);
  const diffMinutes = (now.getTime() - updateTime.getTime()) / (1000 * 60);
  
  if (diffMinutes < 5) return { status: "Live", color: "text-green-500" };
  if (diffMinutes < 30) return { status: "Recent", color: "text-green-400" };
  if (diffMinutes < 60) return { status: "30m ago", color: "text-yellow-500" };
  if (diffMinutes < 120) return { status: "1h ago", color: "text-yellow-600" };
  if (diffMinutes < 1440) return { status: `${Math.floor(diffMinutes / 60)}h ago`, color: "text-orange-500" };
  return { status: "Stale", color: "text-muted-foreground" };
}

function LocationWidget({
  places,
  currentLocation,
  isLoading,
}: {
  places: SavedPlace[] | undefined;
  currentLocation: LocationHistory | undefined;
  isLoading: boolean;
}) {
  const starredPlaces = places?.filter(p => p.isStarred) || [];
  const recentPlaces = places?.slice(0, 5) || [];
  
  const mapCenter: [number, number] = currentLocation 
    ? [parseFloat(currentLocation.latitude), parseFloat(currentLocation.longitude)]
    : places && places.length > 0 
      ? [parseFloat(places[0].latitude), parseFloat(places[0].longitude)]
      : [42.3601, -71.0589];
  
  const locationStatus = getLocationStatus(currentLocation?.createdAt);

  if (isLoading) {
    return (
      <Card className="col-span-1 sm:col-span-2" data-testid="widget-location">
        <CardHeader className="pb-2 sm:pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-[150px] rounded-lg" />
          <Skeleton className="h-12" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-1 sm:col-span-2" data-testid="widget-location">
      <CardHeader className="pb-2 sm:pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Navigation className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm sm:text-base">Location</CardTitle>
          </div>
          <Link href="/location">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" data-testid="button-view-location">
              <MapPin className="h-3 w-3" />
              <span className="hidden sm:inline">View Map</span>
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4">
        <div className="h-[150px] rounded-lg overflow-hidden border relative z-0">
          <MapContainer
            center={mapCenter}
            zoom={13}
            style={{ height: "100%", width: "100%" }}
            zoomControl={false}
            attributionControl={false}
            dragging={false}
            scrollWheelZoom={false}
            doubleClickZoom={false}
            touchZoom={false}
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            <MapCenterController center={mapCenter} />
            
            {currentLocation && (
              <Marker
                position={[parseFloat(currentLocation.latitude), parseFloat(currentLocation.longitude)]}
                icon={currentLocationIcon}
              />
            )}
            
            {places?.slice(0, 10).map((place) => (
              <Marker
                key={place.id}
                position={[parseFloat(place.latitude), parseFloat(place.longitude)]}
                icon={createCustomIcon(place.category, place.isStarred)}
              />
            ))}
          </MapContainer>
        </div>

        {currentLocation && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border">
            <div className="p-1.5 rounded-full bg-green-500/20">
              <Navigation className="h-3.5 w-3.5 text-green-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium" data-testid="text-current-coords">
                {parseFloat(currentLocation.latitude).toFixed(6)}, {parseFloat(currentLocation.longitude).toFixed(6)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {new Date(currentLocation.createdAt).toLocaleString()}
              </p>
            </div>
            <div className={`text-[10px] font-medium ${locationStatus.color}`}>
              {locationStatus.status}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="text-center p-2 sm:p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <MapPin className="h-3 w-3" />
              <span className="text-[10px] sm:text-xs">Places</span>
            </div>
            <p className="text-base sm:text-lg font-semibold" data-testid="stat-places-total">{places?.length || 0}</p>
          </div>
          <div className="text-center p-2 sm:p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <Star className="h-3 w-3" />
              <span className="text-[10px] sm:text-xs">Starred</span>
            </div>
            <p className="text-base sm:text-lg font-semibold" data-testid="stat-places-starred">{starredPlaces.length}</p>
          </div>
          <div className="text-center p-2 sm:p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <Navigation className="h-3 w-3" />
              <span className="text-[10px] sm:text-xs">GPS</span>
            </div>
            <p className={`text-[10px] sm:text-xs font-medium ${locationStatus.color}`} data-testid="stat-location-status">
              {locationStatus.status}
            </p>
          </div>
        </div>

        {starredPlaces.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wide">Starred Places</p>
            <div className="space-y-1.5">
              {starredPlaces.slice(0, 3).map((place) => {
                const CategoryIcon = getCategoryIcon(place.category);
                return (
                  <Link key={place.id} href="/location">
                    <div 
                      className="flex items-center gap-2 sm:gap-3 p-2 rounded-lg border hover-elevate cursor-pointer" 
                      data-testid={`place-preview-${place.id}`}
                    >
                      <div 
                        className="h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: getCategoryColor(place.category) + "20" }}
                      >
                        <CategoryIcon 
                          className="h-3.5 w-3.5 sm:h-4 sm:w-4" 
                          style={{ color: getCategoryColor(place.category) }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-medium truncate">{place.name}</p>
                        {place.address && (
                          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{place.address}</p>
                        )}
                      </div>
                      <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : recentPlaces.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wide">Saved Places</p>
            <div className="space-y-1.5">
              {recentPlaces.slice(0, 3).map((place) => {
                const CategoryIcon = getCategoryIcon(place.category);
                return (
                  <Link key={place.id} href="/location">
                    <div 
                      className="flex items-center gap-2 sm:gap-3 p-2 rounded-lg border hover-elevate cursor-pointer" 
                      data-testid={`place-preview-${place.id}`}
                    >
                      <div 
                        className="h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: getCategoryColor(place.category) + "20" }}
                      >
                        <CategoryIcon 
                          className="h-3.5 w-3.5 sm:h-4 sm:w-4" 
                          style={{ color: getCategoryColor(place.category) }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-medium truncate">{place.name}</p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground truncate capitalize">{place.category}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <MapPin className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
            <p className="text-xs sm:text-sm">No saved places yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface TimelineEntry {
  id: string;
  type: "location" | "lifelog" | "combined";
  timestamp: string;
  endTimestamp?: string;
  location?: {
    latitude: number;
    longitude: number;
    placeName?: string;
    placeCategory?: string;
  };
  lifelog?: {
    id: string;
    title: string;
    speakers?: string[];
    summary?: string;
  };
  activity?: string;
}

interface TimelineResponse {
  startDate: string;
  endDate: string;
  entries: TimelineEntry[];
}

function LocationTimelineWidget({
  isLoading,
}: {
  isLoading: boolean;
}) {
  const { data: timeline } = useQuery<TimelineResponse>({
    queryKey: ["/api/location/timeline?days=1"],
    refetchInterval: 60000,
  });

  const entries = timeline?.entries || [];
  const recentEntries = entries.slice(0, 8);

  const getTimelineIcon = (entry: TimelineEntry) => {
    if (entry.type === "lifelog" || entry.lifelog) {
      return <MessageSquare className="h-3 w-3" />;
    }
    if (entry.type === "combined") {
      return <Navigation className="h-3 w-3" />;
    }
    switch (entry.location?.placeCategory) {
      case "home": return <Home className="h-3 w-3" />;
      case "work": return <Briefcase className="h-3 w-3" />;
      case "restaurant": return <Coffee className="h-3 w-3" />;
      case "healthcare": return <Heart className="h-3 w-3" />;
      default: return <MapPin className="h-3 w-3" />;
    }
  };

  const getTimelineColor = (entry: TimelineEntry) => {
    if (entry.type === "lifelog") return "bg-blue-500/20 text-blue-500";
    if (entry.type === "combined") return "bg-purple-500/20 text-purple-500";
    switch (entry.location?.placeCategory) {
      case "home": return "bg-green-500/20 text-green-500";
      case "work": return "bg-blue-500/20 text-blue-500";
      case "restaurant": return "bg-pink-500/20 text-pink-500";
      case "healthcare": return "bg-red-500/20 text-red-500";
      default: return "bg-gray-500/20 text-gray-500";
    }
  };

  if (isLoading) {
    return (
      <Card data-testid="widget-location-timeline">
        <CardHeader className="pb-2 sm:pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="widget-location-timeline">
      <CardHeader className="pb-2 sm:pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm sm:text-base">Location Timeline</CardTitle>
          </div>
          <Link href="/location">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" data-testid="button-view-timeline">
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
        <CardDescription className="text-[10px] sm:text-xs mt-1">
          Combined location and conversation history
        </CardDescription>
      </CardHeader>
      <CardContent>
        {recentEntries.length > 0 ? (
          <ScrollArea className="h-[200px] pr-3">
            <div className="space-y-2">
              {recentEntries.map((entry, index) => (
                <div 
                  key={`${entry.type}-${entry.timestamp}-${index}`}
                  className="flex items-start gap-2 p-2 rounded-lg border hover-elevate"
                  data-testid={`timeline-entry-${index}`}
                >
                  <div className={`p-1.5 rounded-full shrink-0 ${getTimelineColor(entry)}`}>
                    {getTimelineIcon(entry)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium truncate">
                        {entry.lifelog 
                          ? entry.lifelog.title 
                          : entry.location?.placeName || "Location Update"}
                      </p>
                      {entry.lifelog && entry.location?.placeName && (
                        <Badge variant="outline" className="text-[8px] h-4 px-1 shrink-0">
                          {entry.location.placeName}
                        </Badge>
                      )}
                    </div>
                    {entry.lifelog?.summary && (
                      <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                        {entry.lifelog.summary}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(entry.timestamp), "h:mm a")}
                      </span>
                      {entry.activity && entry.activity !== "unknown" && (
                        <Badge variant="secondary" className="text-[8px] h-4 px-1">
                          {entry.activity}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
            <p className="text-xs sm:text-sm">No recent activity</p>
            <p className="text-[10px] mt-1">Location and conversation data will appear here</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ConversationMetricsSummary {
  totalConversations: number;
  avgToolSuccessRate: number;
  avgResponseTimeMs: number;
  avgRetryRate: number;
  avgFollowUpNeeded: number;
  recentTrend: "improving" | "stable" | "declining";
}

interface MemoryConfidenceStats {
  total: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  needsConfirmation: number;
  averageConfidence: number;
}

function ConversationQualityWidget({
  metrics,
  memoryStats,
  isLoading,
}: {
  metrics: ConversationMetricsSummary | undefined;
  memoryStats: MemoryConfidenceStats | undefined;
  isLoading: boolean;
}) {
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "improving":
        return <ArrowRight className="h-3 w-3 rotate-[-45deg] text-green-500" />;
      case "declining":
        return <ArrowRight className="h-3 w-3 rotate-45 text-yellow-500" />;
      default:
        return <ArrowRight className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 0.9) return "text-green-500";
    if (rate >= 0.7) return "text-yellow-500";
    return "text-destructive";
  };

  if (isLoading) {
    return (
      <Card data-testid="widget-quality-metrics">
        <CardHeader className="pb-2 sm:pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-12" />
        </CardContent>
      </Card>
    );
  }

  const successRate = metrics?.avgToolSuccessRate ?? 0;
  const avgResponseTime = metrics?.avgResponseTimeMs ?? 0;
  const retryRate = metrics?.avgRetryRate ?? 0;
  const followUpRate = metrics?.avgFollowUpNeeded ?? 0;
  const trend = metrics?.recentTrend ?? "stable";

  const confidenceTotal = memoryStats?.total ?? 0;
  const highConf = memoryStats?.highConfidence ?? 0;
  const medConf = memoryStats?.mediumConfidence ?? 0;
  const lowConf = memoryStats?.lowConfidence ?? 0;
  const needsConfirm = memoryStats?.needsConfirmation ?? 0;

  return (
    <Card data-testid="widget-quality-metrics">
      <CardHeader className="pb-2 sm:pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm sm:text-base">AI Quality Metrics</CardTitle>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {getTrendIcon(trend)}
            <span className="capitalize">{trend}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div className="text-center p-2 sm:p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <CheckCircle2 className="h-3 w-3" />
              <span className="text-[10px] sm:text-xs">Success</span>
            </div>
            <p className={`text-base sm:text-lg font-semibold ${getSuccessRateColor(successRate)}`} data-testid="stat-success-rate">
              {(successRate * 100).toFixed(0)}%
            </p>
          </div>
          <div className="text-center p-2 sm:p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <Clock className="h-3 w-3" />
              <span className="text-[10px] sm:text-xs">Avg Time</span>
            </div>
            <p className="text-base sm:text-lg font-semibold" data-testid="stat-avg-time">
              {avgResponseTime > 0 ? `${(avgResponseTime / 1000).toFixed(1)}s` : "—"}
            </p>
          </div>
          <div className="text-center p-2 sm:p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <AlertCircle className="h-3 w-3" />
              <span className="text-[10px] sm:text-xs">Retries</span>
            </div>
            <p className="text-base sm:text-lg font-semibold" data-testid="stat-retry-rate">
              {(retryRate * 100).toFixed(0)}%
            </p>
          </div>
          <div className="text-center p-2 sm:p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <MessageSquare className="h-3 w-3" />
              <span className="text-[10px] sm:text-xs">Follow-ups</span>
            </div>
            <p className="text-base sm:text-lg font-semibold" data-testid="stat-followup-rate">
              {(followUpRate * 100).toFixed(0)}%
            </p>
          </div>
        </div>

        {confidenceTotal > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Memory Confidence
            </p>
            <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-muted">
              {highConf > 0 && (
                <div 
                  className="bg-green-500 h-full" 
                  style={{ width: `${(highConf / confidenceTotal) * 100}%` }}
                  title={`High: ${highConf}`}
                />
              )}
              {medConf > 0 && (
                <div 
                  className="bg-yellow-500 h-full" 
                  style={{ width: `${(medConf / confidenceTotal) * 100}%` }}
                  title={`Medium: ${medConf}`}
                />
              )}
              {lowConf > 0 && (
                <div 
                  className="bg-orange-500 h-full" 
                  style={{ width: `${(lowConf / confidenceTotal) * 100}%` }}
                  title={`Low: ${lowConf}`}
                />
              )}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                High: {highConf}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                Med: {medConf}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                Low: {lowConf}
              </span>
              {needsConfirm > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-2.5 w-2.5" />
                  Verify: {needsConfirm}
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getInsightCategoryIcon(category: string) {
  switch (category) {
    case "task_health":
      return ListTodo;
    case "memory_hygiene":
      return Brain;
    case "calendar_load":
      return Calendar;
    case "cross_domain":
      return Sparkles;
    default:
      return Lightbulb;
  }
}

function NotificationSettingsWidget({
  status,
  isLoading,
  onToggleNotifications,
  onToggleBatching,
  onToggleQuietHours,
  isUpdating,
}: {
  status: NotificationStatus | undefined;
  isLoading: boolean;
  onToggleNotifications: (enabled: boolean) => void;
  onToggleBatching: (enabled: boolean) => void;
  onToggleQuietHours: (enabled: boolean) => void;
  isUpdating: boolean;
}) {
  if (isLoading) {
    return (
      <Card data-testid="widget-notification-settings">
        <CardHeader className="pb-2 sm:pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </CardContent>
      </Card>
    );
  }

  const prefs = status?.preferences;
  const stats = status?.stats;

  return (
    <Card data-testid="widget-notification-settings">
      <CardHeader className="pb-2 sm:pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Bell className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm sm:text-base">Smart Notifications</CardTitle>
          </div>
          {status?.isInQuietHours && (
            <Badge variant="secondary" className="text-[10px] flex items-center gap-1">
              <Moon className="h-3 w-3" />
              Quiet Hours
            </Badge>
          )}
        </div>
        <CardDescription className="text-[10px] sm:text-xs mt-1">
          Intelligent notification batching and quiet hours
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-2 rounded-lg bg-accent/50">
            <p className="text-lg sm:text-xl font-semibold" data-testid="text-pending-notifications">
              {stats?.pending || 0}
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Pending</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-accent/50">
            <p className="text-lg sm:text-xl font-semibold" data-testid="text-sent-today">
              {stats?.sentToday || 0}
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Sent Today</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b">
            <div className="flex items-center gap-2">
              {prefs?.enabled ? (
                <Bell className="h-3.5 w-3.5 text-primary" />
              ) : (
                <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <div>
                <p className="text-xs sm:text-sm font-medium">Notifications</p>
                <p className="text-[10px] text-muted-foreground">Enable SMS notifications</p>
              </div>
            </div>
            <Switch
              checked={prefs?.enabled ?? true}
              onCheckedChange={onToggleNotifications}
              disabled={isUpdating}
              data-testid="switch-notifications-enabled"
            />
          </div>

          <div className="flex items-center justify-between py-2 border-b">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <p className="text-xs sm:text-sm font-medium">Batching</p>
                <p className="text-[10px] text-muted-foreground">
                  Group messages ({prefs?.batchIntervalMinutes || 30} min)
                </p>
              </div>
            </div>
            <Switch
              checked={prefs?.batchingEnabled ?? true}
              onCheckedChange={onToggleBatching}
              disabled={isUpdating || !prefs?.enabled}
              data-testid="switch-batching-enabled"
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Moon className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <p className="text-xs sm:text-sm font-medium">Quiet Hours</p>
                <p className="text-[10px] text-muted-foreground">
                  {prefs?.quietHoursStart} - {prefs?.quietHoursEnd}
                </p>
              </div>
            </div>
            <Switch
              checked={prefs?.quietHoursEnabled ?? true}
              onCheckedChange={onToggleQuietHours}
              disabled={isUpdating || !prefs?.enabled}
              data-testid="switch-quiet-hours-enabled"
            />
          </div>
        </div>

        {status?.schedulerActive && (
          <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
            Scheduler active
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function NewsWidget({
  stories,
  topics,
  isLoading,
}: {
  stories: NewsStory[];
  topics: NewsTopic[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm sm:text-base font-medium flex items-center gap-2">
            <Newspaper className="h-4 w-4" />
            News Updates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const activeTopics = topics.filter(t => t.isActive);
  const hasStories = stories.length > 0;
  const hasTopics = activeTopics.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm sm:text-base font-medium flex items-center gap-2">
          <Newspaper className="h-4 w-4" />
          News Updates
        </CardTitle>
        {hasTopics && (
          <Badge variant="secondary" className="text-xs">
            {activeTopics.length} topic{activeTopics.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasStories && !hasTopics && (
          <div className="text-center py-6 text-muted-foreground">
            <Newspaper className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No news updates yet</p>
            <p className="text-xs mt-1">Configure topics in Settings to start receiving news</p>
          </div>
        )}
        
        {!hasStories && hasTopics && (
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-sm">Tracking {activeTopics.length} topic{activeTopics.length !== 1 ? 's' : ''}</p>
            <p className="text-xs mt-1">News updates will appear here</p>
            <div className="flex flex-wrap justify-center gap-1 mt-2">
              {activeTopics.slice(0, 5).map(topic => (
                <Badge key={topic.id} variant="outline" className="text-xs">
                  {topic.topic}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {hasStories && (
          <div className="space-y-3">
            {stories.slice(0, 5).map((story) => (
              <div key={story.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium leading-tight line-clamp-2">{story.headline}</h4>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{story.summary}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                      <span>{story.source}</span>
                      <span className="opacity-50">|</span>
                      <span>{formatDistanceToNow(new Date(story.createdAt), { addSuffix: true })}</span>
                    </div>
                  </div>
                  {story.url && (
                    <a 
                      href={story.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProactiveInsightsWidget({
  insights,
  isLoading,
  onDismiss,
  onComplete,
  onSnooze,
  onRefresh,
  isRefreshing,
}: {
  insights: Insight[] | undefined;
  isLoading: boolean;
  onDismiss: (id: string) => void;
  onComplete: (id: string) => void;
  onSnooze: (id: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const { toast } = useToast();

  if (isLoading) {
    return (
      <Card className="col-span-1 sm:col-span-2" data-testid="widget-proactive-insights">
        <CardHeader className="pb-2 sm:pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-12" />
        </CardContent>
      </Card>
    );
  }

  const activeInsights = insights
    ?.filter((i) => i.status === "new" || i.status === "surfaced")
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, 5) || [];

  const getPriorityVariant = (priority: string): "destructive" | "secondary" | "default" => {
    switch (priority) {
      case "high":
        return "destructive";
      case "medium":
        return "secondary";
      default:
        return "default";
    }
  };

  return (
    <Card className="col-span-1 sm:col-span-2" data-testid="widget-proactive-insights">
      <CardHeader className="pb-2 sm:pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Lightbulb className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm sm:text-base">Proactive Insights</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={onRefresh}
            disabled={isRefreshing}
            data-testid="button-refresh-insights"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4">
        {activeInsights.length > 0 ? (
          <div className="space-y-2">
            {activeInsights.map((insight) => {
              const CategoryIcon = getInsightCategoryIcon(insight.category);
              return (
                <div
                  key={insight.id}
                  className="flex items-start gap-2 sm:gap-3 p-2 rounded-lg border"
                  data-testid={`insight-item-${insight.id}`}
                >
                  <div className="p-1.5 rounded-lg bg-accent shrink-0 mt-0.5">
                    <CategoryIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xs sm:text-sm font-medium truncate" data-testid={`insight-title-${insight.id}`}>
                        {insight.title}
                      </p>
                      <Badge
                        variant={getPriorityVariant(insight.priority)}
                        className="text-[9px] sm:text-[10px] shrink-0"
                        data-testid={`insight-priority-${insight.id}`}
                      >
                        {insight.priority}
                      </Badge>
                    </div>
                    {insight.suggestedAction && (
                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-2" data-testid={`insight-action-${insight.id}`}>
                        {insight.suggestedAction}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => onDismiss(insight.id)}
                        data-testid={`button-dismiss-insight-${insight.id}`}
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => onComplete(insight.id)}
                        data-testid={`button-complete-insight-${insight.id}`}
                      >
                        <Check className="h-3 w-3 text-green-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => onSnooze(insight.id)}
                        data-testid={`button-snooze-insight-${insight.id}`}
                      >
                        <Clock className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs sm:text-sm" data-testid="text-no-insights">All caught up! No new insights.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function SystemDateTime() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 text-muted-foreground flex-wrap" data-testid="system-datetime">
      <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
      <span className="text-sm sm:text-base font-medium hidden sm:inline">
        {format(currentTime, "EEEE, MMM d, yyyy")}
      </span>
      <span className="text-sm sm:text-base font-medium sm:hidden">
        {format(currentTime, "MMM d")}
      </span>
      <span className="text-sm sm:text-base font-mono tabular-nums">
        {format(currentTime, "h:mm a")}
      </span>
    </div>
  );
}

function AiCostDashboard({
  todayStats,
  weekStats,
  trends,
  agentBreakdown,
  budgetStatus,
  isLoading,
}: {
  todayStats?: AiUsageStats;
  weekStats?: AiUsageStats;
  trends?: { trends: DailyTrendPoint[]; days: number };
  agentBreakdown?: { breakdown: AgentCostBreakdown[]; days: number };
  budgetStatus?: BudgetStatus;
  isLoading?: boolean;
}) {
  const [showDetails, setShowDetails] = useState(false);
  
  if (isLoading) {
    return (
      <Card className="col-span-1 sm:col-span-2" data-testid="widget-ai-usage">
        <CardHeader className="pb-2 sm:pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm sm:text-base">AI Cost Dashboard</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-16" />
          <Skeleton className="h-12" />
        </CardContent>
      </Card>
    );
  }

  const todayCost = (todayStats?.totalCostCents || 0) / 100;
  const weekCost = (weekStats?.totalCostCents || 0) / 100;
  const monthCost = (budgetStatus?.status?.monthly?.spent || 0) / 100;
  const todayCalls = todayStats?.totalCalls || 0;
  const avgLatency = todayStats?.averageLatencyMs || 0;
  const errorRate = ((todayStats?.errorRate || 0) * 100).toFixed(1);
  
  const chartData = trends?.trends?.slice(-14).map(t => ({
    date: format(parseISO(t.date), "MMM d"),
    cost: t.costCents / 100,
    calls: t.calls,
  })) || [];
  
  const hasAlerts = budgetStatus?.status?.alerts && budgetStatus.status.alerts.length > 0;
  
  const topAgents = agentBreakdown?.breakdown?.slice(0, 5) || [];

  return (
    <Card className="col-span-1 sm:col-span-2" data-testid="widget-ai-usage">
      <CardHeader className="pb-2 sm:pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm sm:text-base">AI Cost Dashboard</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {hasAlerts && (
              <Badge variant="destructive" className="text-[10px] sm:text-xs gap-1">
                <AlertTriangle className="h-3 w-3" />
                Alert
              </Badge>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 px-2 text-xs"
              onClick={() => setShowDetails(!showDetails)}
              data-testid="button-toggle-ai-details"
            >
              {showDetails ? "Less" : "More"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasAlerts && (
          <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/20">
            {budgetStatus?.status.alerts.map((alert, i) => (
              <p key={i} className="text-xs text-destructive flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {alert}
              </p>
            ))}
          </div>
        )}
        
        <div className="grid grid-cols-4 gap-3">
          <div className="space-y-1">
            <p className="text-[10px] sm:text-xs text-muted-foreground">Today</p>
            <p className="text-base sm:text-lg font-semibold" data-testid="ai-cost-today">
              ${todayCost.toFixed(2)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] sm:text-xs text-muted-foreground">This Week</p>
            <p className="text-base sm:text-lg font-semibold" data-testid="ai-cost-week">
              ${weekCost.toFixed(2)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] sm:text-xs text-muted-foreground">This Month</p>
            <p className="text-base sm:text-lg font-semibold" data-testid="ai-cost-month">
              ${monthCost.toFixed(2)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] sm:text-xs text-muted-foreground">API Calls</p>
            <p className="text-base sm:text-lg font-semibold" data-testid="ai-calls-today">
              {todayCalls}
            </p>
          </div>
        </div>

        {budgetStatus?.config?.enabled && budgetStatus?.status && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">Budget Status</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Daily</span>
                  <span className={budgetStatus.status.daily?.overBudget ? "text-destructive" : ""}>
                    {budgetStatus.status.daily?.percent ?? 0}%
                  </span>
                </div>
                <Progress 
                  value={Math.min(budgetStatus.status.daily?.percent ?? 0, 100)} 
                  className={`h-1.5 ${budgetStatus.status.daily?.overBudget ? "[&>div]:bg-destructive" : ""}`}
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Weekly</span>
                  <span className={budgetStatus.status.weekly?.overBudget ? "text-destructive" : ""}>
                    {budgetStatus.status.weekly?.percent ?? 0}%
                  </span>
                </div>
                <Progress 
                  value={Math.min(budgetStatus.status.weekly?.percent ?? 0, 100)} 
                  className={`h-1.5 ${budgetStatus.status.weekly?.overBudget ? "[&>div]:bg-destructive" : ""}`}
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Monthly</span>
                  <span className={budgetStatus.status.monthly?.overBudget ? "text-destructive" : ""}>
                    {budgetStatus.status.monthly?.percent ?? 0}%
                  </span>
                </div>
                <Progress 
                  value={Math.min(budgetStatus.status.monthly?.percent ?? 0, 100)} 
                  className={`h-1.5 ${budgetStatus.status.monthly?.overBudget ? "[&>div]:bg-destructive" : ""}`}
                />
              </div>
            </div>
          </div>
        )}

        {chartData.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium mb-2">14-Day Trend</p>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 9 }} 
                    axisLine={false} 
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tick={{ fontSize: 9 }} 
                    axisLine={false} 
                    tickLine={false} 
                    tickFormatter={(v) => `$${v}`}
                    width={35}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      fontSize: 11, 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="cost" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    fill="url(#costGradient)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {showDetails && topAgents.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium mb-2">Cost by Agent/Job</p>
            <div className="space-y-2">
              {topAgents.map((agent) => (
                <div key={agent.agentId} className="flex items-center justify-between gap-2">
                  <span className="text-xs truncate flex-1" title={agent.agentId}>
                    {agent.agentId.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="text-[9px]">
                      {agent.calls} calls
                    </Badge>
                    <span className="text-xs font-medium w-14 text-right">
                      ${(agent.costCents / 100).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showDetails && (
          <div className="pt-2 border-t grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Avg Latency</p>
              <p className="text-sm font-medium">{avgLatency}ms</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Error Rate</p>
              <p className={`text-sm font-medium ${parseFloat(errorRate) > 5 ? 'text-destructive' : ''}`}>
                {errorRate}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Daily Limit</p>
              <p className="text-sm font-medium">
                ${(budgetStatus?.config?.dailyLimitCents || 500) / 100}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardChatWidget() {
  return (
    <Link href="/chat">
      <Card className="hover-elevate cursor-pointer h-full" data-testid="dashboard-chat-widget">
        <CardContent className="p-3 sm:p-4 h-full flex flex-col items-center justify-center min-h-[150px]">
          <div className="p-2 sm:p-3 rounded-lg bg-primary/10 mb-2 sm:mb-3">
            <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          <h3 className="font-medium text-sm sm:text-base mb-1">Chat with ZEKE</h3>
          <p className="text-xs sm:text-sm text-muted-foreground text-center max-w-[200px] mb-3 sm:mb-4">
            Get help with tasks, reminders, or just chat
          </p>
          <Button size="sm" data-testid="button-expand-chat">
            Open Chat
          </Button>
        </CardContent>
      </Card>
    </Link>
  );
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
    queryFn: async () => {
      // Try local calendar first
      const res = await fetch("/api/calendar/today");
      
      // If local calendar fails (503 = service unavailable, or 500 = Google Calendar not connected)
      // Fall back to ZEKE backend proxy
      if (!res.ok && (res.status === 503 || res.status === 500)) {
        console.log("Local calendar unavailable, falling back to ZEKE backend");
        const zekeRes = await fetch("/api/zeke/calendar/today");
        if (!zekeRes.ok) {
          const zekeError = await zekeRes.json().catch(() => ({}));
          throw new Error(zekeError.error || "Failed to fetch today's events from ZEKE backend");
        }
        return zekeRes.json();
      }
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to fetch today's events");
      }
      return res.json();
    },
  });

  const { data: smsStats, isLoading: smsStatsLoading } = useQuery<SmsStats>({
    queryKey: ["/api/twilio/stats"],
  });

  const { data: smsConversations, isLoading: smsConversationsLoading } = useQuery<SmsConversation[]>({
    queryKey: ["/api/twilio/conversations"],
  });

  const { data: savedPlaces, isLoading: placesLoading } = useQuery<SavedPlace[]>({
    queryKey: ["/api/location/places"],
  });

  const { data: locationHistory, isLoading: locationHistoryLoading } = useQuery<LocationHistory[]>({
    queryKey: ["/api/location/history"],
    refetchInterval: 30000,
  });

  const { data: conversationMetrics, isLoading: metricsLoading } = useQuery<ConversationMetricsSummary>({
    queryKey: ["/api/metrics/summary"],
  });

  const { data: memoryConfidence, isLoading: memoryConfLoading } = useQuery<MemoryConfidenceStats>({
    queryKey: ["/api/memory/confidence/stats"],
  });

  const { data: insightsData, isLoading: insightsLoading } = useQuery<{ count: number; insights: Insight[] }>({
    queryKey: ["/api/insights?active=true&limit=5"],
  });
  const insights = insightsData?.insights;

  const { data: newsStories, isLoading: newsStoriesLoading } = useQuery<NewsStory[]>({
    queryKey: ["/api/news/stories?limit=10"],
  });

  const { data: newsTopics, isLoading: newsTopicsLoading } = useQuery<NewsTopic[]>({
    queryKey: ["/api/news/topics"],
  });

  const { data: notificationStatus, isLoading: notificationStatusLoading } = useQuery<NotificationStatus>({
    queryKey: ["/api/notifications/status"],
  });

  const { data: aiStatsToday, isLoading: aiStatsTodayLoading } = useQuery<AiUsageStats>({
    queryKey: ["/api/ai-logs/stats/today"],
    refetchInterval: 60000,
  });

  const { data: aiStatsWeek, isLoading: aiStatsWeekLoading } = useQuery<AiUsageStats>({
    queryKey: ["/api/ai-logs/stats/week"],
    refetchInterval: 60000,
  });

  const { data: aiTrends, isLoading: aiTrendsLoading } = useQuery<{ trends: DailyTrendPoint[]; days: number }>({
    queryKey: ["/api/ai-logs/trends?days=30"],
    refetchInterval: 300000,
  });

  const { data: aiAgentBreakdown, isLoading: aiAgentBreakdownLoading } = useQuery<{ breakdown: AgentCostBreakdown[]; days: number }>({
    queryKey: ["/api/ai-logs/by-agent?days=30"],
    refetchInterval: 300000,
  });

  const { data: aiBudgetStatus, isLoading: aiBudgetStatusLoading } = useQuery<BudgetStatus>({
    queryKey: ["/api/ai-logs/budget"],
    refetchInterval: 60000,
  });

  const isAiStatsLoading = aiStatsTodayLoading || aiStatsWeekLoading || aiTrendsLoading || aiAgentBreakdownLoading || aiBudgetStatusLoading;

  const updateNotificationPrefsMutation = useMutation({
    mutationFn: async (updates: Partial<NotificationPreferences>) => {
      await apiRequest("PATCH", "/api/notifications/preferences", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/status"] });
    },
  });

  const handleToggleNotifications = (enabled: boolean) => {
    updateNotificationPrefsMutation.mutate({ enabled });
  };

  const handleToggleBatching = (batchingEnabled: boolean) => {
    updateNotificationPrefsMutation.mutate({ batchingEnabled });
  };

  const handleToggleQuietHours = (quietHoursEnabled: boolean) => {
    updateNotificationPrefsMutation.mutate({ quietHoursEnabled });
  };

  const refreshInsightsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/insights/refresh");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/insights?active=true&limit=5"] });
    },
  });

  const updateInsightMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/insights/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/insights?active=true&limit=5"] });
    },
  });

  const handleDismissInsight = (id: string) => {
    updateInsightMutation.mutate({ id, status: "dismissed" });
  };

  const handleCompleteInsight = (id: string) => {
    updateInsightMutation.mutate({ id, status: "completed" });
  };

  const handleSnoozeInsight = (id: string) => {
    updateInsightMutation.mutate({ id, status: "snoozed" });
  };

  const handleRefreshInsights = () => {
    refreshInsightsMutation.mutate();
  };

  const currentLocation = locationHistory?.[0];

  const isQualityMetricsLoading = metricsLoading || memoryConfLoading;

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

  const isSmsLoading = smsStatsLoading || smsConversationsLoading;
  const isLocationLoading = placesLoading || locationHistoryLoading;

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-7 md:space-y-8">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight" data-testid="text-greeting">
              {getTimeGreeting()}, Nate
            </h1>
            <SystemDateTime />
          </div>
          <p className="text-muted-foreground text-sm sm:text-base">
            Here's what's happening with ZEKE today
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
          {calendarLoading ? (
            <Skeleton className="h-[90px] sm:h-[100px]" />
          ) : (
            <StatCard
              title="Today's Events"
              value={todayEvents?.length || 0}
              subtitle={todayEvents && todayEvents.length > 0 ? `Next: ${todayEvents[0]?.summary?.substring(0, 15)}...` : "No events"}
              icon={Calendar}
              href="/calendar"
            />
          )}
          {tasksLoading ? (
            <Skeleton className="h-[90px] sm:h-[100px]" />
          ) : (
            <StatCard
              title="Pending Tasks"
              value={stats.tasks.pending}
              subtitle={stats.tasks.overdue > 0 ? `${stats.tasks.overdue} overdue` : stats.tasks.dueToday > 0 ? `${stats.tasks.dueToday} due today` : undefined}
              icon={ListTodo}
              href="/tasks"
              variant={stats.tasks.overdue > 0 ? "warning" : "default"}
            />
          )}
          {groceryLoading ? (
            <Skeleton className="h-[90px] sm:h-[100px]" />
          ) : (
            <StatCard
              title="Grocery Items"
              value={stats.grocery.total - stats.grocery.purchased}
              subtitle={`${stats.grocery.purchased} purchased`}
              icon={ShoppingCart}
              href="/grocery"
            />
          )}
          {memoriesLoading ? (
            <Skeleton className="h-[90px] sm:h-[100px]" />
          ) : (
            <StatCard
              title="Memories"
              value={stats.memories.total}
              subtitle={`${stats.memories.recentCount} this week`}
              icon={Brain}
              href="/memory"
            />
          )}
          {conversationsLoading ? (
            <Skeleton className="h-[90px] sm:h-[100px]" />
          ) : (
            <StatCard
              title="Conversations"
              value={stats.conversations.total}
              subtitle={`${stats.conversations.recentCount} recent`}
              icon={MessageSquare}
              href="/chat"
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-sm sm:text-base font-medium">Today's Schedule</CardTitle>
              <Link href="/calendar">
                <Button size="sm" variant="ghost" className="h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm" data-testid="button-view-all-calendar">
                  View all
                  <ArrowRight className="h-2.5 w-2.5 sm:h-3 sm:w-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
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
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-sm sm:text-base font-medium">Tasks</CardTitle>
              <Link href="/tasks">
                <Button size="sm" variant="ghost" className="h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm" data-testid="button-view-all-tasks">
                  View all
                  <ArrowRight className="h-2.5 w-2.5 sm:h-3 sm:w-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
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

          <Card className="sm:col-span-2 lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-sm sm:text-base font-medium">Grocery List</CardTitle>
              <Link href="/grocery">
                <Button size="sm" variant="ghost" className="h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm" data-testid="button-view-all-grocery">
                  View all
                  <ArrowRight className="h-2.5 w-2.5 sm:h-3 sm:w-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
          <DashboardChatWidget />
          <div className="space-y-3 sm:space-y-4">
            <h2 className="text-base sm:text-lg font-medium">Quick Access</h2>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
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
                title="Automations"
                description="Scheduled tasks and reminders"
                icon={Zap}
                href="/automations"
                action="Manage automations"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
          <ConversationQualityWidget 
            metrics={conversationMetrics}
            memoryStats={memoryConfidence}
            isLoading={isQualityMetricsLoading}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
          <CommunicationsWidget 
            stats={smsStats} 
            conversations={smsConversations}
            isLoading={isSmsLoading}
          />
          <NotificationSettingsWidget
            status={notificationStatus}
            isLoading={notificationStatusLoading}
            onToggleNotifications={handleToggleNotifications}
            onToggleBatching={handleToggleBatching}
            onToggleQuietHours={handleToggleQuietHours}
            isUpdating={updateNotificationPrefsMutation.isPending}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
          <AiCostDashboard
            todayStats={aiStatsToday}
            weekStats={aiStatsWeek}
            trends={aiTrends}
            agentBreakdown={aiAgentBreakdown}
            budgetStatus={aiBudgetStatus}
            isLoading={isAiStatsLoading}
          />
          <ProactiveInsightsWidget
            insights={insights}
            isLoading={insightsLoading}
            onDismiss={handleDismissInsight}
            onComplete={handleCompleteInsight}
            onSnooze={handleSnoozeInsight}
            onRefresh={handleRefreshInsights}
            isRefreshing={refreshInsightsMutation.isPending}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
          <NewsWidget
            stories={newsStories || []}
            topics={newsTopics || []}
            isLoading={newsStoriesLoading || newsTopicsLoading}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
          <LocationWidget
            places={savedPlaces}
            currentLocation={currentLocation}
            isLoading={isLocationLoading}
          />
          <LocationTimelineWidget
            isLoading={isLocationLoading}
          />
        </div>
      </div>
    </div>
  );
}
