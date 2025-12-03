import { Link } from "wouter";
import { MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

interface NotificationStatus {
  stats: {
    pending: number;
  };
}

export function FloatingChatButton() {
  const { data: notificationStatus } = useQuery<NotificationStatus>({
    queryKey: ["/api/notifications/status"],
  });

  const pendingCount = notificationStatus?.stats?.pending || 0;

  return (
    <Link href="/chat">
      <button
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all hover:scale-110 active:scale-95 z-50 flex items-center justify-center"
        aria-label="Open chat with ZEKE"
        data-testid="floating-chat-button"
        style={{
          // Ensure it's above iOS safe area
          bottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
        }}
      >
        <MessageSquare className="h-6 w-6" />
        {pendingCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-6 w-6 rounded-full p-0 flex items-center justify-center text-xs font-semibold"
            data-testid="chat-notification-badge"
          >
            {pendingCount > 9 ? '9+' : pendingCount}
          </Badge>
        )}
      </button>
    </Link>
  );
}
