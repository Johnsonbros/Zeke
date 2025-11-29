import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Brain, 
  Trash2, 
  Heart, 
  Lightbulb,
  FileText,
  Clock
} from "lucide-react";
import { Link } from "wouter";
import type { MemoryNote } from "@shared/schema";
import { format } from "date-fns";

function getMemoryIcon(type: string) {
  switch (type) {
    case "fact":
      return <Lightbulb className="h-4 w-4" />;
    case "preference":
      return <Heart className="h-4 w-4" />;
    case "summary":
      return <FileText className="h-4 w-4" />;
    case "note":
      return <Brain className="h-4 w-4" />;
    default:
      return <Brain className="h-4 w-4" />;
  }
}

function getMemoryColor(type: string) {
  switch (type) {
    case "fact":
      return "bg-blue-500/10 text-blue-500";
    case "preference":
      return "bg-pink-500/10 text-pink-500";
    case "summary":
      return "bg-amber-500/10 text-amber-500";
    case "note":
      return "bg-purple-500/10 text-purple-500";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function MemoryCard({ 
  memory, 
  onDelete 
}: { 
  memory: MemoryNote; 
  onDelete: () => void;
}) {
  const isSuperseded = memory.isSuperseded;
  
  return (
    <Card 
      className={`group transition-all ${isSuperseded ? "opacity-50" : ""}`}
      data-testid={`memory-card-${memory.id}`}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-2 sm:gap-3">
          <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${getMemoryColor(memory.type)}`}>
            {getMemoryIcon(memory.type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
              <Badge variant="secondary" className="text-[9px] sm:text-[10px] capitalize">
                {memory.type}
              </Badge>
              {isSuperseded && (
                <Badge variant="outline" className="text-[9px] sm:text-[10px] text-muted-foreground">
                  Superseded
                </Badge>
              )}
            </div>
            <p className="text-xs sm:text-sm leading-relaxed">{memory.content}</p>
            {memory.context && (
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 italic">
                {memory.context}
              </p>
            )}
            <div className="flex items-center gap-1.5 sm:gap-2 mt-1.5 sm:mt-2">
              <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-muted-foreground" />
              <span className="text-[9px] sm:text-[10px] text-muted-foreground">
                {format(new Date(memory.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </span>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 sm:h-8 sm:w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={onDelete}
            data-testid={`delete-memory-${memory.id}`}
          >
            <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MemoryPage() {
  const { toast } = useToast();

  const { data: memories, isLoading } = useQuery<MemoryNote[]>({
    queryKey: ["/api/memory"],
  });

  const deleteMemoryMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/memory/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memory"] });
      toast({
        title: "Memory deleted",
        description: "The memory has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to delete",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const activeMemories = memories?.filter(m => !m.isSuperseded) || [];
  const supersededMemories = memories?.filter(m => m.isSuperseded) || [];

  const factCount = activeMemories.filter(m => m.type === "fact").length;
  const preferenceCount = activeMemories.filter(m => m.type === "preference").length;
  const summaryCount = activeMemories.filter(m => m.type === "summary").length;
  const noteCount = activeMemories.filter(m => m.type === "note").length;

  return (
    <ScrollArea className="h-full">
      <div className="bg-background" data-testid="memory-page">
        <header className="sticky top-0 z-10 h-11 sm:h-14 border-b border-border bg-background/80 backdrop-blur flex items-center gap-2 sm:gap-3 px-3 sm:px-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Brain className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <h1 className="text-base sm:text-lg font-semibold">ZEKE's Memory</h1>
          </div>
        </header>

        <main className="max-w-3xl mx-auto p-3 sm:p-4 pb-6 sm:pb-8">
          <div className="mb-4 sm:mb-6">
            <p className="text-muted-foreground text-xs sm:text-sm">
              Everything ZEKE has learned about you and your family. These memories help ZEKE be a better assistant.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
            <Card className="p-2 sm:p-3">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="p-1 sm:p-1.5 rounded-md bg-blue-500/10">
                  <Lightbulb className="h-3 w-3 sm:h-4 sm:w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-base sm:text-lg font-semibold">{factCount}</p>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground">Facts</p>
                </div>
              </div>
            </Card>
            <Card className="p-2 sm:p-3">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="p-1 sm:p-1.5 rounded-md bg-pink-500/10">
                  <Heart className="h-3 w-3 sm:h-4 sm:w-4 text-pink-500" />
                </div>
                <div>
                  <p className="text-base sm:text-lg font-semibold">{preferenceCount}</p>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground">Preferences</p>
                </div>
              </div>
            </Card>
            <Card className="p-2 sm:p-3">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="p-1 sm:p-1.5 rounded-md bg-amber-500/10">
                  <FileText className="h-3 w-3 sm:h-4 sm:w-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-base sm:text-lg font-semibold">{summaryCount}</p>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground">Summaries</p>
                </div>
              </div>
            </Card>
            <Card className="p-2 sm:p-3">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="p-1 sm:p-1.5 rounded-md bg-purple-500/10">
                  <Brain className="h-3 w-3 sm:h-4 sm:w-4 text-purple-500" />
                </div>
                <div>
                  <p className="text-base sm:text-lg font-semibold">{noteCount}</p>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground">Notes</p>
                </div>
              </div>
            </Card>
          </div>

          {isLoading ? (
            <div className="space-y-2 sm:space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="h-20 sm:h-24 animate-pulse bg-muted" />
              ))}
            </div>
          ) : activeMemories.length === 0 && supersededMemories.length === 0 ? (
            <Card className="p-6 sm:p-8 text-center">
              <Brain className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-3 sm:mb-4" />
              <h3 className="text-base sm:text-lg font-medium mb-2">No memories yet</h3>
              <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">
                Chat with ZEKE to start building memories. ZEKE learns from your conversations.
              </p>
              <Link href="/">
                <Button data-testid="button-start-chatting">Start Chatting</Button>
              </Link>
            </Card>
          ) : (
            <div className="space-y-4 sm:space-y-6">
              {activeMemories.length > 0 && (
                <div className="space-y-2 sm:space-y-3">
                  <h2 className="text-xs sm:text-sm font-medium text-muted-foreground">Active Memories ({activeMemories.length})</h2>
                  {activeMemories.map((memory) => (
                    <MemoryCard
                      key={memory.id}
                      memory={memory}
                      onDelete={() => deleteMemoryMutation.mutate(memory.id)}
                    />
                  ))}
                </div>
              )}
              
              {supersededMemories.length > 0 && (
                <div className="space-y-2 sm:space-y-3">
                  <h2 className="text-xs sm:text-sm font-medium text-muted-foreground">Superseded ({supersededMemories.length})</h2>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    These memories were corrected or updated with newer information.
                  </p>
                  {supersededMemories.map((memory) => (
                    <MemoryCard
                      key={memory.id}
                      memory={memory}
                      onDelete={() => deleteMemoryMutation.mutate(memory.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </ScrollArea>
  );
}
