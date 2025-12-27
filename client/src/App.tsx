import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger, SidebarInset, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { LocationProvider } from "@/contexts/location-context";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { QuickMenu } from "@/components/quick-menu";
import { useSidebarSwipe } from "@/hooks/use-swipe-gesture";
import { useIsMobile } from "@/hooks/use-mobile";
import { Loader2 } from "lucide-react";
import DashboardPage from "@/pages/dashboard";
import ChatPage from "@/pages/chat";
import GroceryPage from "@/pages/grocery";
import MemoryPage from "@/pages/memory";
import TasksPage from "@/pages/tasks";
import CalendarPage from "@/pages/calendar";
import ContactsPage from "@/pages/contacts";
import AutomationsPage from "@/pages/automations";
import ProfilePage from "@/pages/profile";
import TwilioLogPage from "@/pages/twilio-log";
import LocationPage from "@/pages/location";
import ContextAgentPage from "@/pages/context-agent";
import ListsPage from "@/pages/lists";
import MealsPage from "@/pages/meals";
import OmiPage from "@/pages/omi";
import KnowledgeGraphPage from "@/pages/knowledge-graph";
import IntegrationsPage from "@/pages/integrations";
import FilesPage from "@/pages/files";
import JournalPage from "@/pages/journal";
import EvalPage from "@/pages/eval";
import AiUsagePage from "@/pages/ai-usage";
import ApplicationsPage from "@/pages/applications";
import DevicesPage from "@/pages/devices";
import VoiceProfilesPage from "@/pages/voice-profiles";
import TradingPage from "@/pages/trading";
import LoginPage from "@/pages/login";
import ApplyPage from "@/pages/apply";
import LandingPage from "@/pages/landing";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

function ProtectedRoutes() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/chat" component={ChatPage} />
      <Route path="/grocery" component={GroceryPage} />
      <Route path="/lists" component={ListsPage} />
      <Route path="/meals" component={MealsPage} />
      <Route path="/memory" component={MemoryPage} />
      <Route path="/tasks" component={TasksPage} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/contacts" component={ContactsPage} />
      <Route path="/automations" component={AutomationsPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/sms-log" component={TwilioLogPage} />
      <Route path="/location" component={LocationPage} />
      <Route path="/context-agent" component={ContextAgentPage} />
      <Route path="/omi" component={OmiPage} />
      <Route path="/knowledge-graph" component={KnowledgeGraphPage} />
      <Route path="/integrations" component={IntegrationsPage} />
      <Route path="/files" component={FilesPage} />
      <Route path="/journal" component={JournalPage} />
      <Route path="/eval" component={EvalPage} />
      <Route path="/ai-usage" component={AiUsagePage} />
      <Route path="/applications" component={ApplicationsPage} />
      <Route path="/devices" component={DevicesPage} />
      <Route path="/voice-profiles" component={VoiceProfilesPage} />
      <Route path="/trading" component={TradingPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function SwipeGestureHandler() {
  const { openMobile, setOpenMobile } = useSidebar();
  const isMobile = useIsMobile();

  useSidebarSwipe({
    onOpen: () => setOpenMobile(true),
    onClose: () => setOpenMobile(false),
    isOpen: openMobile,
    edgeWidth: 25,
    threshold: 60,
    enabled: isMobile,
  });

  return null;
}

function AuthenticatedContent() {
  const isMobile = useIsMobile();

  return (
    <>
      <SwipeGestureHandler />
      <div className="flex h-screen w-full">
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-14 items-center gap-3 border-b px-4 md:hidden safe-area-inset-top">
            <SidebarTrigger className="h-10 w-10" data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-sm font-bold text-primary-foreground">Z</span>
              </div>
              <span className="font-semibold text-base">ZEKE</span>
            </div>
          </header>
          <main className="flex-1 overflow-hidden pb-6 md:pb-0">
            <ProtectedRoutes />
          </main>
        </SidebarInset>
      </div>
      {isMobile && <QuickMenu />}
    </>
  );
}

function AuthGate() {
  const { authenticated, isLoading } = useAuth();
  const [location] = useLocation();
  const isMobile = useIsMobile();

  const sidebarStyle = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "3rem",
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (location === "/login") {
    return authenticated ? <Redirect to="/" /> : <LoginPage />;
  }

  if (location === "/apply") {
    return <ApplyPage />;
  }

  if (location === "/about") {
    return <LandingPage />;
  }

  if (!authenticated) {
    return <Redirect to="/about" />;
  }

  return (
    <LocationProvider>
      <SidebarProvider style={sidebarStyle as React.CSSProperties}>
        <AuthenticatedContent />
      </SidebarProvider>
    </LocationProvider>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AuthGate />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
