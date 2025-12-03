import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  ShoppingCart,
  Calendar,
  Brain,
  MapPin,
  Lightbulb,
  Clock,
  X,
} from "lucide-react";
import { format } from "date-fns";

interface ActivityAction {
  id: string;
  type: "task_completed" | "grocery_added" | "calendar_updated" | "memory_created" | "location_updated" | "insight_generated";
  title: string;
  description?: string;
  timestamp: string;
  confidence?: number;
}

interface ActivityFeedProps {
  actions?: ActivityAction[];
  isLoading?: boolean;
}

function getActivityIcon(type: string) {
  switch (type) {
    case "task_completed":
      return CheckCircle2;
    case "grocery_added":
      return ShoppingCart;
    case "calendar_updated":
      return Calendar;
    case "memory_created":
      return Brain;
    case "location_updated":
      return MapPin;
    case "insight_generated":
      return Lightbulb;
    default:
      return Clock;
  }
}

function getActivityColor(type: string) {
  switch (type) {
    case "task_completed":
      return "text-green-500 bg-green-500/10";
    case "grocery_added":
      return "text-orange-500 bg-orange-500/10";
    case "calendar_updated":
      return "text-blue-500 bg-blue-500/10";
    case "memory_created":
      return "text-purple-500 bg-purple-500/10";
    case "location_updated":
      return "text-pink-500 bg-pink-500/10";
    case "insight_generated":
      return "text-yellow-500 bg-yellow-500/10";
    default:
      return "text-muted-foreground bg-muted/50";
  }
}

export function ActivityFeed({ actions = [], isLoading = false }: ActivityFeedProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const currentY = e.touches[0].clientY;
    const distance = currentY - startY;

    // Only pull down when at top of scroll
    if (distance > 0 && containerRef.current?.scrollTop === 0) {
      setPullDistance(Math.min(distance, 120));
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 80) {
      setIsVisible(true);
    }
    setPullDistance(0);
  };

  // Mock data for demonstration - in production, this would come from API
  const mockActions: ActivityAction[] = [
    {
      id: "1",
      type: "task_completed",
      title: "Marked task as done",
      description: "Call mom",
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      confidence: 100,
    },
    {
      id: "2",
      type: "grocery_added",
      title: "Added to grocery list",
      description: "Milk, eggs, bread",
      timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      confidence: 95,
    },
    {
      id: "3",
      type: "calendar_updated",
      title: "Updated calendar event",
      description: "Moved dinner to 7:30 PM",
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      confidence: 98,
    },
    {
      id: "4",
      type: "memory_created",
      title: "Learned new preference",
      description: "You prefer morning workouts",
      timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      confidence: 85,
    },
    {
      id: "5",
      type: "location_updated",
      title: "Location update",
      description: "Left the office",
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      confidence: 100,
    },
  ];

  const displayActions = actions.length > 0 ? actions : mockActions;

  if (!isVisible) {
    return (
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative"
      >
        {pullDistance > 0 && (
          <div
            className="absolute top-0 left-0 right-0 flex items-center justify-center text-muted-foreground text-sm py-2 bg-background/80 backdrop-blur-sm z-10 transition-all"
            style={{ height: `${pullDistance}px`, opacity: pullDistance / 80 }}
          >
            {pullDistance > 80 ? "Release to view activity" : "Pull to see what ZEKE did"}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-40 animate-in slide-in-from-top duration-300">
      <div className="h-full flex flex-col safe-area-inset-bottom">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">ZEKE's Activity</h2>
            <p className="text-xs text-muted-foreground">Recent actions and updates</p>
          </div>
          <button
            onClick={() => setIsVisible(false)}
            className="h-8 w-8 rounded-full hover-elevate flex items-center justify-center"
            aria-label="Close activity feed"
            data-testid="close-activity-feed"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Activity List */}
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-2 py-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 animate-spin opacity-50" />
                <p className="text-sm">Loading activity...</p>
              </div>
            ) : displayActions.length > 0 ? (
              displayActions.map((action) => {
                const Icon = getActivityIcon(action.type);
                const colorClass = getActivityColor(action.type);

                return (
                  <Card
                    key={action.id}
                    className="overflow-hidden"
                    data-testid={`activity-item-${action.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-full shrink-0 ${colorClass}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">{action.title}</p>
                            {action.confidence && action.confidence < 90 && (
                              <Badge variant="outline" className="text-[10px] h-5">
                                {action.confidence}% sure
                              </Badge>
                            )}
                          </div>
                          {action.description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {action.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(action.timestamp), "h:mm a")}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No recent activity</p>
                <p className="text-xs mt-1">ZEKE's actions will appear here</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer hint */}
        <div className="text-center py-3 px-4 border-t text-xs text-muted-foreground">
          Swipe down to close
        </div>
      </div>
    </div>
  );
}
