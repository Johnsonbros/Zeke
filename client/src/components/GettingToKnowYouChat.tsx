import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, Send, RefreshCw, CheckCircle, Loader2 } from "lucide-react";

interface GettingToKnowMessage {
  id: string;
  sessionId: string;
  role: "assistant" | "user";
  content: string;
  topic?: string;
  extractedData?: string;
  createdAt: string;
}

interface GettingToKnowSession {
  id: string;
  status: string;
  currentTopic?: string;
  questionsAsked: number;
  answersCollected: number;
  topicsCompleted: string;
  createdAt: string;
  updatedAt: string;
}

interface SessionData {
  session: GettingToKnowSession;
  messages: GettingToKnowMessage[];
}

export function GettingToKnowYouChat() {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: sessionData, isLoading } = useQuery<SessionData>({
    queryKey: ["/api/getting-to-know/session"],
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest("POST", "/api/getting-to-know/message", { message });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/getting-to-know/session"] });
      setInput("");
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/getting-to-know/reset");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/getting-to-know/session"] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/getting-to-know/complete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/getting-to-know/session"] });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sessionData?.messages]);

  const handleSend = () => {
    if (input.trim() && !sendMessageMutation.isPending) {
      sendMessageMutation.mutate(input.trim());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isCompleted = sessionData?.session?.status === "completed";
  const hasMessages = (sessionData?.messages?.length ?? 0) > 0;

  if (isLoading) {
    return (
      <Card className="mb-4 sm:mb-6" data-testid="card-getting-to-know">
        <CardHeader className="pb-2 sm:pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <MessageCircle className="h-4 w-4 text-primary" />
            </div>
            Getting to Know You
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4 sm:mb-6" data-testid="card-getting-to-know">
      <CardHeader className="pb-2 sm:pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <MessageCircle className="h-4 w-4 text-primary" />
            </div>
            Getting to Know You
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {isCompleted && (
              <Badge variant="outline" className="text-xs gap-1">
                <CheckCircle className="h-3 w-3" />
                Completed
              </Badge>
            )}
            {hasMessages && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                title="Start over"
                data-testid="button-reset-chat"
              >
                <RefreshCw className={`h-4 w-4 ${resetMutation.isPending ? "animate-spin" : ""}`} />
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          {hasMessages 
            ? "Continue the conversation so ZEKE can learn more about you."
            : "Have a quick chat with ZEKE to help it understand your preferences and personality."
          }
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasMessages ? (
          <ScrollArea className="h-48 sm:h-64 border rounded-lg p-3" ref={scrollRef as any}>
            <div className="space-y-3">
              {sessionData?.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  data-testid={`message-${msg.role}-${msg.id}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {sendMessageMutation.isPending && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="h-32 sm:h-40 border rounded-lg flex items-center justify-center bg-muted/30">
            <div className="text-center text-muted-foreground">
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Start a conversation with ZEKE</p>
              <p className="text-xs mt-1">Say "Hi" or ask me to tell you about myself</p>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={hasMessages ? "Type your response..." : "Say hi to ZEKE..."}
            disabled={sendMessageMutation.isPending || isCompleted}
            className="flex-1"
            data-testid="input-getting-to-know-message"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sendMessageMutation.isPending || isCompleted}
            data-testid="button-send-getting-to-know"
          >
            {sendMessageMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {hasMessages && !isCompleted && (sessionData?.messages?.length ?? 0) >= 4 && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
              data-testid="button-complete-chat"
            >
              {completeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Finish for now
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
