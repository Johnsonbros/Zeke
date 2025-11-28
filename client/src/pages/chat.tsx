import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  Send, 
  Plus, 
  MessageSquare, 
  Trash2, 
  Menu,
  X,
  Smartphone
} from "lucide-react";
import type { Conversation, Message, ChatResponse } from "@shared/schema";
import { format } from "date-fns";

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 px-4 py-3" data-testid="typing-indicator">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
          Z
        </AvatarFallback>
      </Avatar>
      <div className="bg-accent rounded-lg px-4 py-3">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
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
      className={`flex items-start gap-3 px-4 py-2 ${isUser ? "flex-row-reverse" : ""}`}
      data-testid={`message-${message.id}`}
    >
      <Avatar className="h-8 w-8 shrink-0">
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
      
      <div className={`flex flex-col max-w-[70%] ${isUser ? "items-end" : "items-start"}`}>
        <div 
          className={`rounded-lg px-4 py-3 relative ${
            isUser 
              ? "bg-primary text-primary-foreground" 
              : "bg-accent text-accent-foreground"
          }`}
        >
          {isSms && (
            <div 
              className={`absolute -top-1 ${isUser ? "-left-1" : "-right-1"} flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground text-[10px]`}
              data-testid={`sms-badge-${message.id}`}
            >
              <Smartphone className="h-2.5 w-2.5" />
              <span>SMS</span>
            </div>
          )}
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
        </div>
        <span className="text-[11px] text-muted-foreground mt-1 px-1">
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

function EmptyState({ onNewChat }: { onNewChat: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4">
      <div className="flex flex-col items-center gap-2">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-3xl font-bold text-primary">Z</span>
        </div>
        <h1 className="text-4xl font-semibold tracking-tight mt-4" data-testid="empty-state-title">ZEKE</h1>
        <p className="text-muted-foreground text-lg">Your personal AI assistant</p>
      </div>
      <Button 
        onClick={onNewChat} 
        className="gap-2"
        data-testid="button-start-conversation"
      >
        <MessageSquare className="h-4 w-4" />
        Start a conversation
      </Button>
    </div>
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

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

  return (
    <div className="flex h-screen bg-background" data-testid="chat-page">
      {/* Sidebar */}
      <aside 
        className={`${
          sidebarOpen ? "w-[280px]" : "w-0"
        } transition-all duration-200 bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden shrink-0`}
        data-testid="sidebar"
      >
        <div className="p-4">
          <Button 
            onClick={handleNewChat} 
            className="w-full gap-2"
            data-testid="button-new-chat"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>
        
        <ScrollArea className="flex-1 px-2">
          <div className="space-y-1 pb-4">
            {conversationsLoading ? (
              <div className="space-y-2 px-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
            ) : conversations?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8 px-4">
                No conversations yet
              </p>
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

        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-accent text-accent-foreground text-sm font-medium">
                NJ
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Nate Johnson</p>
              <p className="text-[11px] text-muted-foreground">CEO, Johnson Bros.</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              data-testid="button-toggle-sidebar"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <h1 className="text-lg font-semibold">
              {messagesData?.conversation?.title || "ZEKE"}
            </h1>
          </div>
        </header>

        {/* Messages area */}
        <div className="flex-1 overflow-hidden">
          {!activeConversationId && !sendMessageMutation.isPending ? (
            <EmptyState onNewChat={() => textareaRef.current?.focus()} />
          ) : (
            <ScrollArea className="h-full">
              <div className="py-4">
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

        {/* Input area */}
        <div className="p-4 border-t border-border bg-background/80 backdrop-blur shrink-0">
          <div className="flex items-end gap-3 max-w-4xl mx-auto">
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message ZEKE..."
                className="min-h-[48px] max-h-[150px] resize-none pr-12 text-base"
                rows={1}
                disabled={sendMessageMutation.isPending}
                data-testid="input-message"
              />
            </div>
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!inputValue.trim() || sendMessageMutation.isPending}
              className="h-12 w-12 rounded-full shrink-0"
              data-testid="button-send"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            ZEKE can make mistakes. Consider checking important info.
          </p>
        </div>
      </main>
    </div>
  );
}
