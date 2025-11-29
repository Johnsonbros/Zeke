import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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
      <Route path="/" component={ChatPage} />
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
  // Always use dark mode for ZEKE
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
