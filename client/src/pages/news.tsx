import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import {
  Rss,
  ThumbsUp,
  ThumbsDown,
  Plus,
  Trash2,
  ExternalLink,
  RefreshCw,
  Settings2,
  TrendingUp,
  Scale,
  Lightbulb,
  X,
  Check,
  Pencil,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
} from "@/components/ui/form";
import type { NewsTopic, NewsStory } from "@shared/schema";
import { format } from "date-fns";

interface NewsStoryWithMeta {
  id: string;
  headline: string;
  summary: string;
  source: string;
  sourceUrl: string;
  category: string;
  publishedAt: string;
  imageUrl?: string;
  urgency?: "normal" | "breaking";
  isChallengePerspective?: boolean;
}

interface FeedbackStats {
  thumbsUp: number;
  thumbsDown: number;
  byTopic: Record<string, { up: number; down: number }>;
}

const topicFormSchema = z.object({
  topic: z.string().min(1, "Topic name is required"),
  description: z.string().optional(),
  keywords: z.string().optional(),
  priority: z.number().min(1).max(10).default(5),
  isActive: z.boolean().default(true),
  forceInclude: z.boolean().default(false),
  isChallengePerspective: z.boolean().default(false),
});

type TopicFormValues = z.infer<typeof topicFormSchema>;

function getCategoryColor(category: string): string {
  const categoryColors: Record<string, string> = {
    Technology: "bg-indigo-500/20 text-indigo-400",
    Business: "bg-emerald-500/20 text-emerald-400",
    Science: "bg-violet-500/20 text-violet-400",
    Politics: "bg-red-500/20 text-red-400",
    Entertainment: "bg-pink-500/20 text-pink-400",
    Sports: "bg-amber-500/20 text-amber-400",
    Health: "bg-cyan-500/20 text-cyan-400",
    World: "bg-blue-500/20 text-blue-400",
    technology: "bg-indigo-500/20 text-indigo-400",
    business: "bg-emerald-500/20 text-emerald-400",
    science: "bg-violet-500/20 text-violet-400",
    health: "bg-cyan-500/20 text-cyan-400",
  };
  return categoryColors[category] || "bg-muted text-muted-foreground";
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function NewsStoryCard({
  story,
  onFeedback,
  isPending,
}: {
  story: NewsStoryWithMeta;
  onFeedback: (storyId: string, feedbackType: "thumbs_up" | "thumbs_down", reason?: string) => void;
  isPending: boolean;
}) {
  const [feedbackState, setFeedbackState] = useState<"none" | "up" | "down" | "reason">("none");
  const [reason, setReason] = useState("");

  const handleThumbsUp = () => {
    setFeedbackState("up");
    onFeedback(story.id, "thumbs_up");
  };

  const handleThumbsDown = () => {
    setFeedbackState("reason");
  };

  const handleSubmitReason = () => {
    if (reason.trim()) {
      onFeedback(story.id, "thumbs_down", reason.trim());
      setFeedbackState("down");
    }
  };

  const handleCancelReason = () => {
    setReason("");
    setFeedbackState("none");
  };

  return (
    <Card className="relative overflow-visible">
      {story.urgency === "breaking" && (
        <div className="absolute -top-2 left-4 flex items-center gap-1 bg-red-500 text-white px-2 py-0.5 rounded-full text-xs font-medium">
          <Zap className="h-3 w-3" />
          BREAKING
        </div>
      )}
      {story.isChallengePerspective && (
        <div className="absolute -top-2 right-4 flex items-center gap-1 bg-violet-500 text-white px-2 py-0.5 rounded-full text-xs font-medium">
          <Scale className="h-3 w-3" />
          Different View
        </div>
      )}
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <Badge variant="secondary" className={getCategoryColor(story.category)}>
            {story.category}
          </Badge>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{story.source}</span>
            <span>•</span>
            <span>{formatRelativeTime(story.publishedAt)}</span>
          </div>
        </div>

        <a
          href={story.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group"
          data-testid={`link-story-${story.id}`}
        >
          <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">
            {story.headline}
          </h3>
        </a>

        <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
          {story.summary}
        </p>

        <div className="flex items-center justify-between gap-2">
          <a
            href={story.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
            data-testid={`link-read-more-${story.id}`}
          >
            <ExternalLink className="h-3 w-3" />
            Read full article
          </a>

          {feedbackState === "none" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Helpful?</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={handleThumbsUp}
                disabled={isPending}
                data-testid={`button-thumbs-up-${story.id}`}
              >
                <ThumbsUp className="h-4 w-4 text-green-500" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={handleThumbsDown}
                disabled={isPending}
                data-testid={`button-thumbs-down-${story.id}`}
              >
                <ThumbsDown className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          )}

          {feedbackState === "up" && (
            <div className="flex items-center gap-2 text-green-500 text-sm">
              <Check className="h-4 w-4" />
              <span>Thanks! More like this.</span>
            </div>
          )}

          {feedbackState === "down" && (
            <div className="flex items-center gap-2 text-primary text-sm">
              <Check className="h-4 w-4" />
              <span>Feedback sent to ZEKE</span>
            </div>
          )}
        </div>

        {feedbackState === "reason" && (
          <div className="mt-4 p-3 bg-muted rounded-lg space-y-3">
            <p className="text-sm text-muted-foreground">Tell ZEKE why:</p>
            <Textarea
              placeholder="e.g., Not interested in this topic..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="resize-none"
              rows={2}
              maxLength={200}
              data-testid={`input-feedback-reason-${story.id}`}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelReason}
                disabled={isPending}
                data-testid={`button-cancel-feedback-${story.id}`}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubmitReason}
                disabled={isPending || !reason.trim()}
                data-testid={`button-submit-feedback-${story.id}`}
              >
                Send
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TopicRow({
  topic,
  onEdit,
  onDelete,
  onToggle,
}: {
  topic: NewsTopic;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (field: "isActive" | "forceInclude" | "isChallengePerspective", value: boolean) => void;
}) {
  const keywords = topic.keywords ? JSON.parse(topic.keywords) : [];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border rounded-lg hover-elevate">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="font-medium">{topic.topic}</h4>
          {topic.isChallengePerspective && (
            <Badge variant="secondary" className="bg-violet-500/20 text-violet-400">
              <Scale className="h-3 w-3 mr-1" />
              Balance
            </Badge>
          )}
          {topic.forceInclude && (
            <Badge variant="secondary" className="bg-amber-500/20 text-amber-400">
              <Lightbulb className="h-3 w-3 mr-1" />
              Always Show
            </Badge>
          )}
          {!topic.isActive && (
            <Badge variant="secondary" className="bg-muted text-muted-foreground">
              Paused
            </Badge>
          )}
        </div>
        {topic.description && (
          <p className="text-sm text-muted-foreground mt-1">{topic.description}</p>
        )}
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {keywords.slice(0, 5).map((kw: string, i: number) => (
              <Badge key={i} variant="outline" className="text-xs">
                {kw}
              </Badge>
            ))}
            {keywords.length > 5 && (
              <Badge variant="outline" className="text-xs">
                +{keywords.length - 5} more
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Active</span>
          <Switch
            checked={topic.isActive}
            onCheckedChange={(checked) => onToggle("isActive", checked)}
            data-testid={`switch-active-${topic.id}`}
          />
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={onEdit}
          data-testid={`button-edit-topic-${topic.id}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onDelete}
          data-testid={`button-delete-topic-${topic.id}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

export default function NewsPage() {
  const { toast } = useToast();
  const [showTopicDialog, setShowTopicDialog] = useState(false);
  const [editingTopic, setEditingTopic] = useState<NewsTopic | null>(null);
  const [activeTab, setActiveTab] = useState("stories");

  const form = useForm<TopicFormValues>({
    resolver: zodResolver(topicFormSchema),
    defaultValues: {
      topic: "",
      description: "",
      keywords: "",
      priority: 5,
      isActive: true,
      forceInclude: false,
      isChallengePerspective: false,
    },
  });

  const { data: stories = [], isLoading: storiesLoading, refetch: refetchStories } = useQuery<NewsStoryWithMeta[]>({
    queryKey: ["/api/news/stories"],
  });

  const { data: topics = [], isLoading: topicsLoading } = useQuery<NewsTopic[]>({
    queryKey: ["/api/news/topics"],
  });

  const { data: stats } = useQuery<FeedbackStats>({
    queryKey: ["/api/news/feedback-stats"],
  });

  const feedbackMutation = useMutation({
    mutationFn: async ({ storyId, feedbackType, reason }: { storyId: string; feedbackType: "thumbs_up" | "thumbs_down"; reason?: string }) => {
      return apiRequest("/api/news/feedback", {
        method: "POST",
        body: JSON.stringify({ storyId, feedbackType, reason, source: "web" }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/news/feedback-stats"] });
      toast({ title: "Feedback recorded", description: "ZEKE will learn from your preferences." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit feedback", variant: "destructive" });
    },
  });

  const createTopicMutation = useMutation({
    mutationFn: async (data: TopicFormValues) => {
      const payload = {
        ...data,
        keywords: data.keywords ? data.keywords.split(",").map(k => k.trim()).filter(Boolean) : [],
      };
      return apiRequest("/api/news/topics", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/news/topics"] });
      setShowTopicDialog(false);
      form.reset();
      toast({ title: "Topic created", description: "Your new topic has been added." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create topic", variant: "destructive" });
    },
  });

  const updateTopicMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TopicFormValues> }) => {
      const payload = {
        ...data,
        keywords: data.keywords ? data.keywords.split(",").map(k => k.trim()).filter(Boolean) : undefined,
      };
      return apiRequest(`/api/news/topics/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/news/topics"] });
      setShowTopicDialog(false);
      setEditingTopic(null);
      form.reset();
      toast({ title: "Topic updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update topic", variant: "destructive" });
    },
  });

  const deleteTopicMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/news/topics/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/news/topics"] });
      toast({ title: "Topic deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete topic", variant: "destructive" });
    },
  });

  const handleFeedback = (storyId: string, feedbackType: "thumbs_up" | "thumbs_down", reason?: string) => {
    feedbackMutation.mutate({ storyId, feedbackType, reason });
  };

  const handleEditTopic = (topic: NewsTopic) => {
    setEditingTopic(topic);
    const keywords = topic.keywords ? JSON.parse(topic.keywords).join(", ") : "";
    form.reset({
      topic: topic.topic,
      description: topic.description || "",
      keywords,
      priority: topic.priority,
      isActive: topic.isActive,
      forceInclude: topic.forceInclude ?? false,
      isChallengePerspective: topic.isChallengePerspective ?? false,
    });
    setShowTopicDialog(true);
  };

  const handleToggleTopic = (topic: NewsTopic, field: "isActive" | "forceInclude" | "isChallengePerspective", value: boolean) => {
    updateTopicMutation.mutate({ id: topic.id, data: { [field]: value } as any });
  };

  const onSubmit = (data: TopicFormValues) => {
    if (editingTopic) {
      updateTopicMutation.mutate({ id: editingTopic.id, data });
    } else {
      createTopicMutation.mutate(data);
    }
  };

  const openNewTopicDialog = () => {
    setEditingTopic(null);
    form.reset({
      topic: "",
      description: "",
      keywords: "",
      priority: 5,
      isActive: true,
      forceInclude: false,
      isChallengePerspective: false,
    });
    setShowTopicDialog(true);
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
              <Rss className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-page-title">News</h1>
              <p className="text-sm text-muted-foreground">
                Curated stories synced with your mobile app
              </p>
            </div>
          </div>

          {stats && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <ThumbsUp className="h-4 w-4 text-green-500" />
                <span>{stats.thumbsUp}</span>
              </div>
              <div className="flex items-center gap-1">
                <ThumbsDown className="h-4 w-4 text-red-500" />
                <span>{stats.thumbsDown}</span>
              </div>
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <TabsList>
              <TabsTrigger value="stories" data-testid="tab-stories">
                <Rss className="h-4 w-4 mr-2" />
                Stories
              </TabsTrigger>
              <TabsTrigger value="topics" data-testid="tab-topics">
                <Settings2 className="h-4 w-4 mr-2" />
                Topics
              </TabsTrigger>
            </TabsList>

            {activeTab === "stories" && (
              <Button
                variant="outline"
                onClick={() => refetchStories()}
                disabled={storiesLoading}
                data-testid="button-refresh-stories"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${storiesLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            )}

            {activeTab === "topics" && (
              <Button onClick={openNewTopicDialog} data-testid="button-add-topic">
                <Plus className="h-4 w-4 mr-2" />
                Add Topic
              </Button>
            )}
          </div>

          <TabsContent value="stories" className="mt-6">
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Scale className="h-5 w-5 text-violet-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium mb-1">Balanced Perspectives</h4>
                    <p className="text-sm text-muted-foreground">
                      ZEKE curates news based on your interests while ensuring you're exposed to diverse viewpoints.
                      Stories marked with "Different View" offer perspectives that may challenge your usual thinking.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {storiesLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i}>
                    <CardContent className="pt-6 space-y-3">
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : stories.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Rss className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">No news stories available</h3>
                  <p className="text-sm text-muted-foreground">
                    Check back later for curated news based on your topics.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {stories.map((story) => (
                  <NewsStoryCard
                    key={story.id}
                    story={story}
                    onFeedback={handleFeedback}
                    isPending={feedbackMutation.isPending}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="topics" className="mt-6">
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Lightbulb className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium mb-1">Prevent Echo Chambers</h4>
                    <p className="text-sm text-muted-foreground">
                      Mark topics as "Always Show" to ensure ZEKE includes them even if you don't engage often.
                      Use "Challenge Perspective" for topics that offer viewpoints different from your usual preferences.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {topicsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : topics.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Settings2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">No topics configured</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Add topics to personalize your news feed.
                  </p>
                  <Button onClick={openNewTopicDialog} data-testid="button-add-first-topic">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Topic
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {topics.map((topic) => (
                  <TopicRow
                    key={topic.id}
                    topic={topic}
                    onEdit={() => handleEditTopic(topic)}
                    onDelete={() => deleteTopicMutation.mutate(topic.id)}
                    onToggle={(field, value) => handleToggleTopic(topic, field, value)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showTopicDialog} onOpenChange={setShowTopicDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTopic ? "Edit Topic" : "Add New Topic"}</DialogTitle>
            <DialogDescription>
              {editingTopic
                ? "Update this topic's settings and preferences."
                : "Add a topic to personalize your news feed."}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="topic"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Topic Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Artificial Intelligence" {...field} data-testid="input-topic-name" />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="What aspects of this topic interest you?"
                        {...field}
                        rows={2}
                        data-testid="input-topic-description"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="keywords"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Keywords</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="AI, machine learning, neural networks"
                        {...field}
                        data-testid="input-topic-keywords"
                      />
                    </FormControl>
                    <FormDescription>Comma-separated keywords for better matching</FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority: {field.value}</FormLabel>
                    <FormControl>
                      <Slider
                        min={1}
                        max={10}
                        step={1}
                        value={[field.value]}
                        onValueChange={([val]) => field.onChange(val)}
                        data-testid="slider-topic-priority"
                      />
                    </FormControl>
                    <FormDescription>Higher priority topics appear more often</FormDescription>
                  </FormItem>
                )}
              />

              <div className="space-y-3 pt-2">
                <FormField
                  control={form.control}
                  name="forceInclude"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm font-medium">Always Show</FormLabel>
                        <FormDescription className="text-xs">
                          Include even with low engagement
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-force-include"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isChallengePerspective"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm font-medium">Challenge Perspective</FormLabel>
                        <FormDescription className="text-xs">
                          Offers different viewpoints
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-challenge-perspective"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowTopicDialog(false)}
                  data-testid="button-cancel-topic"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createTopicMutation.isPending || updateTopicMutation.isPending}
                  data-testid="button-save-topic"
                >
                  {editingTopic ? "Save Changes" : "Add Topic"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
