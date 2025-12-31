import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  MessageSquare,
  Sparkles,
  ShoppingCart,
  ListTodo,
  Calendar,
  Brain,
  Users,
  Zap,
  Phone,
  History,
  ChevronDown,
  Plus,
  Settings,
  User,
  MapPin,
  Bot,
  List,
  Utensils,
  Mic,
  Network,
  FileText,
  BookOpen,
  Target,
  Activity,
  ClipboardList,
  LogOut,
  Bluetooth,
  AudioWaveform,
  TrendingUp,
  Rss,
  DollarSign,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import type { Conversation } from "@shared/schema";
import { format } from "date-fns";

const mainNavItems = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    href: "/",
  },
  {
    title: "Getting To Know You",
    icon: Sparkles,
    href: "/profile",
    description: "Help ZEKE understand you",
  },
  {
    title: "Trading",
    icon: TrendingUp,
    href: "/trading",
    description: "Stock trading with ZEKE",
  },
  {
    title: "News",
    icon: Rss,
    href: "/news",
    description: "Curated news & topics",
  },
  {
    title: "Grocery List",
    icon: ShoppingCart,
    href: "/grocery",
    description: "Shared family list",
  },
  {
    title: "Lists",
    icon: List,
    href: "/lists",
    description: "Manage custom lists",
  },
  {
    title: "Files",
    icon: FileText,
    href: "/files",
    description: "Documents & notes",
  },
  {
    title: "Meals & Recipes",
    icon: Utensils,
    href: "/meals",
    description: "Food preferences & recipes",
  },
  {
    title: "Tasks",
    icon: ListTodo,
    href: "/tasks",
    description: "Manage your to-dos",
  },
  {
    title: "Calendar",
    icon: Calendar,
    href: "/calendar",
    description: "View your schedule",
  },
  {
    title: "ZEKE's Memory",
    icon: Brain,
    href: "/memory",
    description: "What ZEKE knows about you",
  },
  {
    title: "Contacts",
    icon: Users,
    href: "/contacts",
    description: "Manage SMS access",
  },
  {
    title: "Automations",
    icon: Zap,
    href: "/automations",
    description: "Reminders & scheduled tasks",
  },
  {
    title: "Locations",
    icon: MapPin,
    href: "/location",
    description: "Saved places & proximity alerts",
  },
  {
    title: "SMS Log",
    icon: Phone,
    href: "/sms-log",
    description: "View all SMS activity",
  },
  {
    title: "Context Agent",
    icon: Bot,
    href: "/context-agent",
    description: "Wake word detection",
  },
  {
    title: "Omi Analytics",
    icon: Mic,
    href: "/omi",
    description: "AI conversation insights",
  },
  {
    title: "Devices",
    icon: Bluetooth,
    href: "/devices",
    description: "Manage hardware pendants",
  },
  {
    title: "Voice Profiles",
    icon: AudioWaveform,
    href: "/voice-profiles",
    description: "Speaker identification",
  },
  {
    title: "Journal",
    icon: BookOpen,
    href: "/journal",
    description: "Daily summaries & insights",
  },
  {
    title: "Knowledge Graph",
    icon: Network,
    href: "/knowledge-graph",
    description: "Explore entity connections",
  },
  {
    title: "Integrations",
    icon: Settings,
    href: "/integrations",
    description: "Webhooks, API keys & services",
  },
  {
    title: "Ideal Eval",
    icon: Target,
    href: "/eval",
    description: "Score against the three pillars",
  },
  {
    title: "AI Usage",
    icon: Activity,
    href: "/ai-usage",
    description: "Track AI costs and usage",
  },
  {
    title: "P&L Dashboard",
    icon: DollarSign,
    href: "/pnl",
    description: "Track costs vs trading revenue",
  },
  {
    title: "Applications",
    icon: ClipboardList,
    href: "/applications",
    description: "Manage ZEKE agent applications",
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const [historyOpen, setHistoryOpen] = useState(false);
  const { setOpenMobile } = useSidebar();
  const { logout, isAdmin } = useAuth();

  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const recentConversations = conversations?.slice(0, 10) || [];
  const conversationCount = conversations?.length || 0;

  const closeSidebarOnMobile = () => {
    setOpenMobile(false);
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4 safe-area-inset-top">
        <Link href="/" onClick={closeSidebarOnMobile}>
          <div className="flex items-center gap-3 cursor-pointer hover-elevate rounded-lg p-2 -m-2 transition-all" data-testid="link-home">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shadow-md">
              <span className="text-xl font-bold text-primary-foreground">Z</span>
            </div>
            <div>
              <h1 className="text-xl font-semibold">ZEKE</h1>
              <p className="text-sm text-muted-foreground">Your Personal AI</p>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <div className="px-4 pb-3">
        <Link href="/chat" onClick={closeSidebarOnMobile}>
          <Button className="w-full gap-2 h-11 text-base shadow-sm" data-testid="button-new-chat">
            <Plus className="h-5 w-5" />
            New Chat
          </Button>
        </Link>
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.href}
                    tooltip={item.description || item.title}
                  >
                    <Link 
                      href={item.href} 
                      onClick={closeSidebarOnMobile}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="cursor-pointer hover-elevate rounded-md px-2 -mx-2" data-testid="button-chat-history-toggle">
                <div className="flex items-center gap-2 flex-1">
                  <History className="h-4 w-4" />
                  <span>Chat History</span>
                </div>
                <Badge variant="secondary" className="text-[10px] mr-2">
                  {conversationCount}
                </Badge>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${historyOpen ? "rotate-180" : ""}`}
                />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {recentConversations.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                      No conversations yet
                    </div>
                  ) : (
                    recentConversations.map((conversation) => (
                      <SidebarMenuItem key={conversation.id}>
                        <SidebarMenuButton
                          asChild
                          isActive={location === `/chat?id=${conversation.id}`}
                        >
                          <Link
                            href={`/chat?id=${conversation.id}`}
                            onClick={closeSidebarOnMobile}
                            data-testid={`nav-conversation-${conversation.id}`}
                          >
                            <MessageSquare className="h-4 w-4" />
                            <div className="flex-1 min-w-0">
                              <span className="truncate block text-sm">
                                {conversation.title}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {format(new Date(conversation.updatedAt), "MMM d")}
                              </span>
                            </div>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))
                  )}
                  {conversationCount > 10 && (
                    <Link href="/chat" onClick={closeSidebarOnMobile}>
                      <div className="px-2 py-2 text-xs text-primary text-center cursor-pointer hover:underline">
                        View all {conversationCount} conversations
                      </div>
                    </Link>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 safe-area-inset-bottom space-y-2">
        <Link href="/profile" onClick={closeSidebarOnMobile}>
          <div
            className="flex items-center gap-3 p-3 rounded-xl hover-elevate cursor-pointer transition-all border"
            data-testid="link-profile"
          >
            <Avatar className="h-11 w-11">
              <AvatarFallback className="bg-accent text-accent-foreground text-base font-semibold">
                NJ
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">Nate Johnson</p>
              <p className="text-xs text-muted-foreground truncate">
                CEO, Johnson Bros.
              </p>
            </div>
            <Settings className="h-5 w-5 text-muted-foreground" />
          </div>
        </Link>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={() => {
            closeSidebarOnMobile();
            logout();
          }}
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
