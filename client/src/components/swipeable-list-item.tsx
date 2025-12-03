import { useState, useRef, ReactNode } from "react";
import { Check, X, MessageSquare, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SwipeAction {
  icon: typeof Check;
  label: string;
  variant: "success" | "destructive" | "primary" | "secondary";
  onAction: () => void;
}

interface SwipeableListItemProps {
  children: ReactNode;
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  onSwipe?: (direction: "left" | "right") => void;
}

export function SwipeableListItem({
  children,
  leftActions = [],
  rightActions = [],
  onSwipe,
}: SwipeableListItemProps) {
  const [swipeDistance, setSwipeDistance] = useState(0);
  const [startX, setStartX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;

    const currentX = e.touches[0].clientX;
    const distance = currentX - startX;

    // Limit swipe distance to 120px in either direction
    setSwipeDistance(Math.max(-120, Math.min(120, distance)));
  };

  const handleTouchEnd = () => {
    setIsSwiping(false);

    // If swiped past threshold (60px), trigger action
    if (Math.abs(swipeDistance) > 60) {
      const direction = swipeDistance > 0 ? "right" : "left";
      onSwipe?.(direction);

      // Execute first action in the direction
      if (direction === "right" && leftActions.length > 0) {
        leftActions[0].onAction();
      } else if (direction === "left" && rightActions.length > 0) {
        rightActions[0].onAction();
      }
    }

    // Animate back to center
    setSwipeDistance(0);
  };

  const getActionColor = (variant: string) => {
    switch (variant) {
      case "success":
        return "bg-green-500 text-white";
      case "destructive":
        return "bg-red-500 text-white";
      case "primary":
        return "bg-primary text-primary-foreground";
      case "secondary":
        return "bg-secondary text-secondary-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="relative overflow-hidden" ref={containerRef}>
      {/* Left actions (revealed on swipe right) */}
      {leftActions.length > 0 && (
        <div className="absolute inset-y-0 left-0 flex items-center gap-1 pl-2">
          {leftActions.map((action, index) => (
            <div
              key={index}
              className={`flex flex-col items-center justify-center h-full px-3 rounded-lg transition-all ${getActionColor(
                action.variant
              )}`}
              style={{
                opacity: swipeDistance > 20 ? 1 : 0,
                transform: `translateX(${Math.max(0, swipeDistance - 80)}px)`,
              }}
            >
              <action.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium mt-0.5">{action.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Right actions (revealed on swipe left) */}
      {rightActions.length > 0 && (
        <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
          {rightActions.map((action, index) => (
            <div
              key={index}
              className={`flex flex-col items-center justify-center h-full px-3 rounded-lg transition-all ${getActionColor(
                action.variant
              )}`}
              style={{
                opacity: swipeDistance < -20 ? 1 : 0,
                transform: `translateX(${Math.min(0, swipeDistance + 80)}px)`,
              }}
            >
              <action.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium mt-0.5">{action.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main content */}
      <div
        className="relative bg-background transition-transform touch-pan-y"
        style={{
          transform: `translateX(${swipeDistance}px)`,
          transition: isSwiping ? "none" : "transform 0.3s ease-out",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

// Preset swipe action configurations for common use cases
export const SWIPE_PRESETS = {
  task: {
    leftActions: [
      {
        icon: Check,
        label: "Done",
        variant: "success" as const,
        onAction: () => {},
      },
    ],
    rightActions: [
      {
        icon: MessageSquare,
        label: "Ask ZEKE",
        variant: "primary" as const,
        onAction: () => {},
      },
      {
        icon: X,
        label: "Delete",
        variant: "destructive" as const,
        onAction: () => {},
      },
    ],
  },
  grocery: {
    leftActions: [
      {
        icon: Check,
        label: "Bought",
        variant: "success" as const,
        onAction: () => {},
      },
    ],
    rightActions: [
      {
        icon: MessageSquare,
        label: "Ask ZEKE",
        variant: "primary" as const,
        onAction: () => {},
      },
    ],
  },
  calendar: {
    rightActions: [
      {
        icon: MessageSquare,
        label: "Ask ZEKE",
        variant: "primary" as const,
        onAction: () => {},
      },
      {
        icon: Info,
        label: "Details",
        variant: "secondary" as const,
        onAction: () => {},
      },
    ],
  },
};
