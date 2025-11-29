import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import DashboardPage from "@/pages/dashboard";
import ChatPage from "@/pages/chat";
import GroceryPage from "@/pages/grocery";
import MemoryPage from "@/pages/memory";
import TasksPage from "@/pages/tasks";
import ContactsPage from "@/pages/contacts";
import AutomationsPage from "@/pages/automations";
import ProfilePage from "@/pages/profile";
import TwilioLogPage from "@/pages/twilio-log";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

function Router() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/chat" component={ChatPage} />
      <Route path="/grocery" component={GroceryPage} />
      <Route path="/memory" component={MemoryPage} />
      <Route path="/tasks" component={TasksPage} />
      <Route path="/contacts" component={ContactsPage} />
      <Route path="/automations" component={AutomationsPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/sms-log" component={TwilioLogPage} />
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
        <SidebarProvider style={sidebarStyle as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <AppSidebar />
            <SidebarInset>
              <header className="flex h-12 items-center gap-2 border-b px-4 md:hidden">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
                    <span className="text-xs font-bold text-primary-foreground">Z</span>
                  </div>
                  <span className="font-semibold text-sm">ZEKE</span>
                </div>
              </header>
              <main className="flex-1 overflow-hidden">
                <Router />
              </main>
            </SidebarInset>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
