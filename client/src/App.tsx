import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { LocationProvider } from "@/contexts/location-context";
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
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

function Router() {
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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const sidebarStyle = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LocationProvider>
          <SidebarProvider style={sidebarStyle as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <AppSidebar />
              <SidebarInset>
                {/* Mobile header with larger touch targets */}
                <header className="flex h-14 items-center gap-3 border-b px-4 md:hidden safe-area-inset-top">
                  <SidebarTrigger className="h-10 w-10" data-testid="button-sidebar-toggle" />
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                      <span className="text-sm font-bold text-primary-foreground">Z</span>
                    </div>
                    <span className="font-semibold text-base">ZEKE</span>
                  </div>
                </header>
                <main className="flex-1 overflow-hidden">
                  <Router />
                </main>
              </SidebarInset>
            </div>
          </SidebarProvider>
          <Toaster />
        </LocationProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
