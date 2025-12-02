import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Phone,
  MessageSquare,
  Send,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  AlertCircle,
  Clock,
  CheckCircle2,
  Bot,
  User,
  Zap,
  Calendar,
  Bell,
  Globe
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { format, parseISO } from "date-fns";
import type { TwilioMessage } from "@shared/schema";

type TwilioConversation = {
  phoneNumber: string;
  contactId: string | null;
  contactName: string | null;
  lastMessage: string;
  lastMessageAt: string;
  messageCount: number;
};

type TwilioStats = {
  total: number;
  inbound: number;
  outbound: number;
  failed: number;
  bySource: Record<string, number>;
};

const SOURCE_CONFIG: Record<string, { label: string; icon: typeof Bot; color: string }> = {
  webhook: { label: "Incoming", icon: ArrowDownLeft, color: "text-blue-500" },
  reply: { label: "AI Reply", icon: Bot, color: "text-primary" },
  send_sms_tool: { label: "AI Tool", icon: Zap, color: "text-purple-500" },
  reminder: { label: "Reminder", icon: Bell, color: "text-yellow-500" },
  automation: { label: "Automation", icon: Calendar, color: "text-green-500" },
  daily_checkin: { label: "Check-in", icon: Clock, color: "text-orange-500" },
  web_ui: { label: "Web UI", icon: Globe, color: "text-cyan-500" },
};

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
  received: { label: "Received", icon: ArrowDownLeft, color: "text-blue-500" },
  queued: { label: "Queued", icon: Clock, color: "text-yellow-500" },
  sending: { label: "Sending", icon: Clock, color: "text-yellow-500" },
  sent: { label: "Sent", icon: CheckCircle2, color: "text-green-500" },
  delivered: { label: "Delivered", icon: CheckCircle2, color: "text-green-500" },
  failed: { label: "Failed", icon: AlertCircle, color: "text-destructive" },
};

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const num = digits.slice(1);
    return `(${num.slice(0, 3)}) ${num.slice(3, 6)}-${num.slice(6)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map(part => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function ConversationCard({ 
  conversation, 
  onClick,
  isSelected
}: { 
  conversation: TwilioConversation;
  onClick: () => void;
  isSelected: boolean;
}) {
  return (
    <Card 
      className={`p-3 cursor-pointer hover-elevate transition-all ${isSelected ? "ring-2 ring-primary" : ""}`}
      onClick={onClick}
      data-testid={`twilio-conversation-${conversation.phoneNumber}`}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className="bg-accent">
            {conversation.contactName ? getInitials(conversation.contactName) : <Phone className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate" data-testid={`text-phone-${conversation.phoneNumber}`}>
              {conversation.contactName || formatPhoneDisplay(conversation.phoneNumber)}
            </span>
          </div>
          
          {conversation.contactName && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              <span>{formatPhoneDisplay(conversation.phoneNumber)}</span>
            </div>
          )}
          
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
            {conversation.lastMessage}
          </p>
          
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary" className="text-xs gap-1">
              <MessageSquare className="h-3 w-3" />
              {conversation.messageCount}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {format(parseISO(conversation.lastMessageAt), "MMM d, h:mm a")}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function MessageBubble({ message }: { message: TwilioMessage }) {
  const isInbound = message.direction === "inbound";
  const sourceConfig = SOURCE_CONFIG[message.source] || { label: message.source, icon: MessageSquare, color: "text-muted-foreground" };
  const statusConfig = STATUS_CONFIG[message.status] || { label: message.status, icon: Clock, color: "text-muted-foreground" };
  const SourceIcon = sourceConfig.icon;
  const StatusIcon = statusConfig.icon;
  
  return (
    <div 
      className={`flex items-start gap-2 md:gap-3 px-3 md:px-4 py-1.5 md:py-2 ${isInbound ? "" : "flex-row-reverse"}`}
      data-testid={`twilio-message-${message.id}`}
    >
      <Avatar className="h-7 w-7 md:h-8 md:w-8 shrink-0">
        <AvatarFallback 
          className={`text-xs md:text-sm font-semibold ${
            isInbound 
              ? "bg-accent text-accent-foreground" 
              : "bg-primary text-primary-foreground"
          }`}
        >
          {isInbound ? <User className="h-4 w-4" /> : "Z"}
        </AvatarFallback>
      </Avatar>
      
      <div className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isInbound ? "items-start" : "items-end"}`}>
        <div 
          className={`rounded-lg px-3 md:px-4 py-2 md:py-3 relative ${
            isInbound 
              ? "bg-accent text-accent-foreground" 
              : message.status === "failed" 
                ? "bg-destructive/20 text-foreground border border-destructive"
                : "bg-primary text-primary-foreground"
          }`}
        >
          <p className="text-[13px] md:text-sm whitespace-pre-wrap leading-relaxed">{message.body}</p>
        </div>
        
        <div className="flex items-center gap-2 mt-1 px-1">
          <Badge variant="outline" className={`text-[10px] gap-1 ${sourceConfig.color}`}>
            <SourceIcon className="h-2.5 w-2.5" />
            {sourceConfig.label}
          </Badge>
          
          <span className={`flex items-center gap-1 text-[10px] ${statusConfig.color}`}>
            <StatusIcon className="h-2.5 w-2.5" />
            {statusConfig.label}
          </span>
          
          <span className="text-[10px] text-muted-foreground">
            {format(parseISO(message.createdAt), "MMM d, h:mm a")}
          </span>
        </div>
        
        {message.status === "failed" && message.errorMessage && (
          <div className="flex items-center gap-1 mt-1 px-1 text-[10px] text-destructive">
            <AlertCircle className="h-2.5 w-2.5" />
            {message.errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationPanel({ 
  phone, 
  contactName,
  onClose,
  onSendMessage
}: { 
  phone: string;
  contactName: string | null;
  onClose: () => void;
  onSendMessage: (to: string, message: string) => void;
}) {
  const [newMessage, setNewMessage] = useState("");
  
  const { data: messages, isLoading } = useQuery<TwilioMessage[]>({
    queryKey: ["/api/twilio/messages/phone", phone],
    queryFn: async () => {
      const res = await fetch(`/api/twilio/messages/phone/${encodeURIComponent(phone)}?limit=100`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const handleSend = () => {
    if (!newMessage.trim()) return;
    onSendMessage(phone, newMessage);
    setNewMessage("");
  };

  const sortedMessages = messages ? [...messages].reverse() : [];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-conversation">
            <X className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="font-semibold">{contactName || formatPhoneDisplay(phone)}</h2>
            {contactName && (
              <p className="text-xs text-muted-foreground">{formatPhoneDisplay(phone)}</p>
            )}
            <p className="text-xs text-muted-foreground">{messages?.length || 0} messages</p>
          </div>
        </div>
      </div>
      
      <ScrollArea className="flex-1 p-2">
        {isLoading ? (
          <div className="space-y-4 p-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : sortedMessages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No messages yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {sortedMessages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </ScrollArea>
      
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="min-h-[60px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            data-testid="input-new-message"
          />
          <Button 
            onClick={handleSend} 
            disabled={!newMessage.trim()}
            data-testid="button-send-message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function TwilioLogPage() {
  const { toast } = useToast();
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeMessage, setComposeMessage] = useState("");
  
  const { data: conversations, isLoading: conversationsLoading } = useQuery<TwilioConversation[]>({
    queryKey: ["/api/twilio/conversations"],
    refetchInterval: 10000,
  });

  const { data: stats } = useQuery<TwilioStats>({
    queryKey: ["/api/twilio/stats"],
    refetchInterval: 30000,
  });

  const sendMutation = useMutation({
    mutationFn: async ({ to, message }: { to: string; message: string }) => {
      return apiRequest("POST", "/api/sms/send", { to, message });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/twilio/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/twilio/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/twilio/stats"] });
      if (selectedPhone) {
        queryClient.invalidateQueries({ queryKey: ["/api/twilio/messages/phone", selectedPhone] });
      }
      toast({ title: "Message sent", description: "SMS has been sent successfully" });
      setIsComposeOpen(false);
      setComposeTo("");
      setComposeMessage("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to send SMS",
        variant: "destructive"
      });
    },
  });

  const handleSendMessage = (to: string, message: string) => {
    sendMutation.mutate({ to, message });
  };

  const selectedConversation = conversations?.find(c => c.phoneNumber === selectedPhone);

  return (
    <div className="flex h-screen bg-background">
      <div className={`${selectedPhone ? "hidden md:flex" : "flex"} flex-col flex-1 border-r border-border`}>
        <header className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            <h1 className="font-semibold text-lg">SMS Log</h1>
          </div>
          <Button size="sm" onClick={() => setIsComposeOpen(true)} data-testid="button-compose">
            <Send className="h-4 w-4 mr-1" />
            Send
          </Button>
        </header>
        
        {stats && (
          <div className="p-4 border-b border-border">
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center">
                <div className="text-lg font-semibold" data-testid="stat-total">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-blue-500" data-testid="stat-inbound">{stats.inbound}</div>
                <div className="text-xs text-muted-foreground">Inbound</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-green-500" data-testid="stat-outbound">{stats.outbound}</div>
                <div className="text-xs text-muted-foreground">Outbound</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-destructive" data-testid="stat-failed">{stats.failed}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
            </div>
          </div>
        )}
        
        <ScrollArea className="flex-1 p-4">
          {conversationsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : !conversations || conversations.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">No SMS Activity</h3>
              <p className="text-sm text-muted-foreground mb-4">
                SMS messages will appear here once Twilio is active
              </p>
              <Button onClick={() => setIsComposeOpen(true)} data-testid="button-compose-empty">
                <Send className="h-4 w-4 mr-2" />
                Send First Message
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {conversations.map((conv) => (
                <ConversationCard
                  key={conv.phoneNumber}
                  conversation={conv}
                  onClick={() => setSelectedPhone(conv.phoneNumber)}
                  isSelected={selectedPhone === conv.phoneNumber}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
      
      {selectedPhone && (
        <div className="flex-1 md:flex hidden flex-col">
          <ConversationPanel
            phone={selectedPhone}
            contactName={selectedConversation?.contactName || null}
            onClose={() => setSelectedPhone(null)}
            onSendMessage={handleSendMessage}
          />
        </div>
      )}
      
      {selectedPhone && (
        <div className="fixed inset-0 z-50 md:hidden bg-background">
          <ConversationPanel
            phone={selectedPhone}
            contactName={selectedConversation?.contactName || null}
            onClose={() => setSelectedPhone(null)}
            onSendMessage={handleSendMessage}
          />
        </div>
      )}
      
      <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send SMS</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">To</label>
              <Input
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
                placeholder="Phone number (e.g., 6175551234)"
                data-testid="input-compose-to"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Message</label>
              <Textarea
                value={composeMessage}
                onChange={(e) => setComposeMessage(e.target.value)}
                placeholder="Type your message..."
                className="min-h-[100px]"
                data-testid="input-compose-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsComposeOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => handleSendMessage(composeTo, composeMessage)}
              disabled={!composeTo.trim() || !composeMessage.trim() || sendMutation.isPending}
              data-testid="button-compose-send"
            >
              {sendMutation.isPending ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
