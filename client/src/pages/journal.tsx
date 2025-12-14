import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  CheckSquare,
  Brain,
  Lightbulb,
  Star,
  RefreshCw,
} from "lucide-react";

interface JournalEntry {
  id: string;
  date: string;
  title: string;
  summary: string;
  mood: string | null;
  insights: string;
  keyEvents: string;
  highlights: string;
  metrics: string;
  conversationCount: number;
  taskCompletedCount: number;
  taskCreatedCount: number;
  memoryCreatedCount: number;
  createdAt: string;
  updatedAt: string;
}

function JournalEntryCard({
  entry,
  isSelected,
  onClick,
}: {
  entry: JournalEntry;
  isSelected: boolean;
  onClick: () => void;
}) {
  const date = parseISO(entry.date);

  return (
    <Card
      className={`cursor-pointer transition-all hover-elevate ${
        isSelected ? "ring-2 ring-primary" : ""
      }`}
      onClick={onClick}
      data-testid={`card-journal-${entry.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-muted-foreground">
                {format(date, "EEE, MMM d")}
              </span>
              {entry.mood && (
                <Badge variant="secondary" className="text-xs">
                  {entry.mood}
                </Badge>
              )}
            </div>
            <h3 className="font-semibold truncate">{entry.title}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
              {entry.summary.substring(0, 120)}...
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {entry.conversationCount}
          </span>
          <span className="flex items-center gap-1">
            <CheckSquare className="h-3 w-3" />
            {entry.taskCompletedCount}
          </span>
          <span className="flex items-center gap-1">
            <Brain className="h-3 w-3" />
            {entry.memoryCreatedCount}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function JournalEntryDetail({ entry }: { entry: JournalEntry }) {
  const date = parseISO(entry.date);
  const insights = JSON.parse(entry.insights || "[]") as string[];
  const keyEvents = JSON.parse(entry.keyEvents || "[]") as Array<{
    time: string;
    event: string;
    category: string;
  }>;
  const highlights = JSON.parse(entry.highlights || "[]") as string[];

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Calendar className="h-4 w-4" />
            {format(date, "EEEE, MMMM d, yyyy")}
          </div>
          <h1 className="text-2xl font-bold">{entry.title}</h1>
          {entry.mood && (
            <Badge variant="outline" className="mt-2">
              Mood: {entry.mood}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <MessageSquare className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <div className="text-2xl font-bold">{entry.conversationCount}</div>
              <div className="text-xs text-muted-foreground">Conversations</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <CheckSquare className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <div className="text-2xl font-bold">{entry.taskCompletedCount}</div>
              <div className="text-xs text-muted-foreground">Completed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <CheckSquare className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <div className="text-2xl font-bold">{entry.taskCreatedCount}</div>
              <div className="text-xs text-muted-foreground">Created</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Brain className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <div className="text-2xl font-bold">{entry.memoryCreatedCount}</div>
              <div className="text-xs text-muted-foreground">Memories</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap leading-relaxed">{entry.summary}</p>
          </CardContent>
        </Card>

        {highlights.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500" />
                Highlights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {highlights.map((highlight, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2 shrink-0" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {insights.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-amber-500" />
                Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {insights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500 mt-2 shrink-0" />
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {keyEvents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Key Events</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {keyEvents.map((event, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Badge variant="outline" className="shrink-0">
                      {event.time}
                    </Badge>
                    <div>
                      <p>{event.event}</p>
                      <span className="text-xs text-muted-foreground capitalize">
                        {event.category}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}

export default function JournalPage() {
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const { toast } = useToast();

  const { data: entries, isLoading } = useQuery<JournalEntry[]>({
    queryKey: ["/api/journal"],
  });

  const generateMutation = useMutation({
    mutationFn: async (date?: string) => {
      const response = await apiRequest("POST", "/api/journal/generate", {
        date: date || new Date().toISOString().split("T")[0],
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal"] });
      toast({
        title: "Journal entry created",
        description: "Today's summary has been generated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to generate",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleGenerateToday = () => {
    generateMutation.mutate(undefined);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 md:p-6 border-b">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Journal</h1>
              <p className="text-sm text-muted-foreground">
                Daily summaries and insights
              </p>
            </div>
          </div>
          <Button
            onClick={handleGenerateToday}
            disabled={generateMutation.isPending}
            data-testid="button-generate-journal"
          >
            {generateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Generate Today
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 border-r flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))
              ) : entries && entries.length > 0 ? (
                entries.map((entry) => (
                  <JournalEntryCard
                    key={entry.id}
                    entry={entry}
                    isSelected={selectedEntry?.id === entry.id}
                    onClick={() => setSelectedEntry(entry)}
                  />
                ))
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No journal entries yet</p>
                  <p className="text-sm mt-1">
                    Click "Generate Today" to create your first entry
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="flex-1 bg-muted/30">
          {selectedEntry ? (
            <JournalEntryDetail entry={selectedEntry} />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <BookOpen className="h-16 w-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">Select an entry to view</p>
                <p className="text-sm mt-1">
                  Choose a journal entry from the list
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
