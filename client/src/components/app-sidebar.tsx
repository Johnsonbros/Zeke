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
} from "lucide-react";
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
    title: "Grocery List",
    icon: ShoppingCart,
    href: "/grocery",
    description: "Shared family list",
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
];

export function AppSidebar() {
  const [location] = useLocation();
  const [historyOpen, setHistoryOpen] = useState(false);
  const { setOpenMobile } = useSidebar();

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
      <SidebarHeader className="p-4">
        <Link href="/" onClick={closeSidebarOnMobile}>
          <div className="flex items-center gap-3 cursor-pointer" data-testid="link-home">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-lg font-bold text-primary-foreground">Z</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold">ZEKE</h1>
              <p className="text-xs text-muted-foreground">Your Personal AI</p>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <div className="px-4 pb-2">
        <Link href="/chat" onClick={closeSidebarOnMobile}>
          <Button className="w-full gap-2" data-testid="button-new-chat">
            <Plus className="h-4 w-4" />
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

      <SidebarFooter className="p-4">
        <Link href="/profile" onClick={closeSidebarOnMobile}>
          <div
            className="flex items-center gap-3 p-2 rounded-lg hover-elevate cursor-pointer"
            data-testid="link-profile"
          >
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-accent text-accent-foreground text-sm font-semibold">
                NJ
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Nate Johnson</p>
              <p className="text-xs text-muted-foreground truncate">
                CEO, Johnson Bros.
              </p>
            </div>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </div>
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}
