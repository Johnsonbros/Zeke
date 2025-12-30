import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, 
  Trash2, 
  Users,
  Phone,
  PhoneCall,
  PhoneOutgoing,
  Shield,
  MessageSquare,
  Calendar,
  ShoppingCart,
  Bell,
  ListTodo,
  User,
  Briefcase,
  UserX,
  Crown,
  Heart,
  X,
  Pencil,
  Check,
  ChevronRight,
  Eye,
  Send,
  StickyNote,
  Mail,
  Bot,
  Clock
} from "lucide-react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import type { Contact, Conversation, AccessLevel, TwilioMessage, ContactNote } from "@shared/schema";
import { accessLevels, defaultPermissionsByLevel, getContactFullName } from "@shared/schema";
import { format, parseISO } from "date-fns";

const MASTER_ADMIN_PHONE = "6177013332";

type ContactWithStats = Contact & {
  messageCount: number;
  conversations: Conversation[];
};

function getContactDisplayName(contact: Contact): string {
  return getContactFullName(contact);
}

const ACCESS_LEVEL_CONFIG: Record<AccessLevel, { label: string; icon: typeof Crown; color: string; description: string }> = {
  admin: { 
    label: "Admin", 
    icon: Crown, 
    color: "text-yellow-500",
    description: "Full access to everything"
  },
  family: { 
    label: "Family", 
    icon: Heart, 
    color: "text-pink-500",
    description: "Personal info, calendar, grocery, reminders"
  },
  friend: { 
    label: "Friend", 
    icon: Users, 
    color: "text-blue-500",
    description: "General chat only"
  },
  business: { 
    label: "Business", 
    icon: Briefcase, 
    color: "text-green-500",
    description: "General chat only"
  },
  restricted: { 
    label: "Restricted", 
    icon: Shield, 
    color: "text-orange-500",
    description: "Very limited access"
  },
  unknown: { 
    label: "Unknown", 
    icon: UserX, 
    color: "text-muted-foreground",
    description: "Not yet classified"
  },
};

const contactFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  middleName: z.string().optional(),
  phoneNumber: z.string().min(10, "Valid phone number required"),
  email: z.string().email().optional().or(z.literal("")),
  aiAssistantPhone: z.string().optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  accessLevel: z.enum(accessLevels).default("unknown"),
  relationship: z.string().optional(),
  notes: z.string().optional(),
  canAccessPersonalInfo: z.boolean().default(false),
  canAccessCalendar: z.boolean().default(false),
  canAccessTasks: z.boolean().default(false),
  canAccessGrocery: z.boolean().default(false),
  canSetReminders: z.boolean().default(false),
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function getInitials(contact: Contact): string {
  const first = contact.firstName?.[0] || "";
  const last = contact.lastName?.[0] || "";
  return (first + last).toUpperCase() || "?";
}

function ContactCard({ 
  contact, 
  onClick,
  isSelected
}: { 
  contact: ContactWithStats;
  onClick: () => void;
  isSelected: boolean;
}) {
  const config = ACCESS_LEVEL_CONFIG[contact.accessLevel];
  const Icon = config.icon;
  const isMasterAdmin = contact.phoneNumber.replace(/\D/g, "").endsWith(MASTER_ADMIN_PHONE);
  
  return (
    <Card 
      className={`p-2.5 sm:p-3 md:p-4 cursor-pointer hover-elevate transition-all ${isSelected ? "ring-2 ring-primary" : ""}`}
      onClick={onClick}
      data-testid={`contact-card-${contact.id}`}
    >
      <div className="flex items-start gap-2 sm:gap-3">
        <Avatar className="h-9 w-9 sm:h-10 sm:w-10 shrink-0">
          <AvatarFallback className={`text-xs sm:text-sm ${isMasterAdmin ? "bg-primary text-primary-foreground" : "bg-accent"}`}>
            {getInitials(contact)}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <span className="font-medium text-xs sm:text-sm truncate" data-testid={`text-contact-name-${contact.id}`}>
              {getContactDisplayName(contact)}
            </span>
            {isMasterAdmin && (
              <Badge variant="default" className="text-[10px] sm:text-xs gap-0.5 sm:gap-1">
                <Crown className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                Master
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground mt-0.5">
            <Phone className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
            <span className="truncate">{formatPhoneDisplay(contact.phoneNumber)}</span>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2 mt-1.5 sm:mt-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] sm:text-xs gap-0.5 sm:gap-1 ${config.color}`}>
              <Icon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              {config.label}
            </Badge>
            
            {contact.messageCount > 0 && (
              <Badge variant="secondary" className="text-[10px] sm:text-xs gap-0.5 sm:gap-1">
                <MessageSquare className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                {contact.messageCount}
              </Badge>
            )}
          </div>
        </div>
        
        <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
      </div>
    </Card>
  );
}

function PermissionToggle({ 
  label, 
  description,
  icon: Icon,
  checked, 
  onCheckedChange,
  disabled
}: { 
  label: string;
  description: string;
  icon: typeof Calendar;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-2 sm:p-3 gap-2 rounded-lg border border-border">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${checked ? "bg-primary/20" : "bg-muted"}`}>
          <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${checked ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-medium truncate">{label}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{description}</p>
        </div>
      </div>
      <Switch 
        checked={checked} 
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="shrink-0"
      />
    </div>
  );
}

function ContactDetailPanel({ 
  contact, 
  onClose,
  onUpdate,
  onDelete
}: { 
  contact: ContactWithStats;
  onClose: () => void;
  onUpdate: (data: Partial<ContactFormValues>) => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [messageText, setMessageText] = useState("");
  const { toast } = useToast();
  const config = ACCESS_LEVEL_CONFIG[contact.accessLevel];
  const isMasterAdmin = contact.phoneNumber.replace(/\D/g, "").endsWith(MASTER_ADMIN_PHONE);
  
  const { data: messages, isLoading: isLoadingMessages } = useQuery<TwilioMessage[]>({
    queryKey: ['/api/twilio/messages/phone', contact.phoneNumber],
    queryFn: async () => {
      const response = await fetch(`/api/twilio/messages/phone/${encodeURIComponent(contact.phoneNumber)}`);
      if (!response.ok) throw new Error('Failed to fetch messages');
      return response.json();
    },
  });
  
  const sendMessageMutation = useMutation({
    mutationFn: async ({ to, message }: { to: string; message: string }) => {
      return apiRequest("POST", "/api/sms/send", { to, message });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/twilio/messages/phone', contact.phoneNumber] });
      queryClient.invalidateQueries({ queryKey: ["/api/twilio/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/twilio/conversations"] });
      toast({ title: "Message sent", description: `SMS sent to ${getContactDisplayName(contact)}` });
      setMessageText("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to send SMS",
        variant: "destructive"
      });
    },
  });
  
  const callContactMutation = useMutation({
    mutationFn: async ({ phoneNumber, message }: { phoneNumber: string; message?: string }) => {
      return apiRequest("POST", "/api/twilio/call", { phoneNumber, message });
    },
    onSuccess: () => {
      toast({ 
        title: "Call initiated", 
        description: `Calling ${getContactDisplayName(contact)}...`
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Call failed", 
        description: error.message || "Failed to initiate call",
        variant: "destructive"
      });
    },
  });
  
  const handleCallContact = () => {
    callContactMutation.mutate({ phoneNumber: contact.phoneNumber });
  };
  
  const handleSendMessage = () => {
    if (!messageText.trim()) return;
    sendMessageMutation.mutate({ to: contact.phoneNumber, message: messageText.trim() });
  };
  
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      firstName: contact.firstName,
      lastName: contact.lastName,
      middleName: contact.middleName || "",
      phoneNumber: contact.phoneNumber,
      email: contact.email || "",
      aiAssistantPhone: contact.aiAssistantPhone || "",
      imageUrl: contact.imageUrl || "",
      accessLevel: contact.accessLevel,
      relationship: contact.relationship || "",
      notes: contact.notes || "",
      canAccessPersonalInfo: contact.canAccessPersonalInfo,
      canAccessCalendar: contact.canAccessCalendar,
      canAccessTasks: contact.canAccessTasks,
      canAccessGrocery: contact.canAccessGrocery,
      canSetReminders: contact.canSetReminders,
    },
  });

  const handleSave = () => {
    const values = form.getValues();
    onUpdate(values);
    setIsEditing(false);
  };

  const handleAccessLevelChange = (level: AccessLevel) => {
    form.setValue("accessLevel", level);
    const defaults = defaultPermissionsByLevel[level];
    form.setValue("canAccessPersonalInfo", defaults.canAccessPersonalInfo);
    form.setValue("canAccessCalendar", defaults.canAccessCalendar);
    form.setValue("canAccessTasks", defaults.canAccessTasks);
    form.setValue("canAccessGrocery", defaults.canAccessGrocery);
    form.setValue("canSetReminders", defaults.canSetReminders);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-3 sm:p-4 gap-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={onClose} data-testid="button-close-detail">
            <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="font-semibold text-sm sm:text-base truncate">{getContactDisplayName(contact)}</h2>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{formatPhoneDisplay(contact.phoneNumber)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          {isEditing ? (
            <>
              <Button variant="ghost" size="sm" className="h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" className="h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3" onClick={handleSave} data-testid="button-save-contact">
                <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
                Save
              </Button>
            </>
          ) : (
            <>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 sm:h-9 sm:w-9 text-green-600 dark:text-green-500" 
                onClick={handleCallContact}
                disabled={callContactMutation.isPending}
                data-testid="button-call-contact"
              >
                <PhoneOutgoing className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => setIsEditing(true)} data-testid="button-edit-contact">
                <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
              {!isMasterAdmin && (
                <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 text-destructive" onClick={onDelete} data-testid="button-delete-contact">
                  <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      
      <Tabs defaultValue="messages" className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="p-2 sm:p-3 border-b border-border shrink-0">
          <TabsList className="w-full h-8 sm:h-9">
            <TabsTrigger value="messages" className="flex-1 text-xs sm:text-sm gap-1 sm:gap-1.5" data-testid="tab-messages">
              <MessageSquare className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Messages
            </TabsTrigger>
            <TabsTrigger value="details" className="flex-1 text-xs sm:text-sm gap-1 sm:gap-1.5" data-testid="tab-details">
              <User className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Details
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-1 text-xs sm:text-sm gap-1 sm:gap-1.5" data-testid="tab-notes">
              <StickyNote className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Notes
            </TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="messages" className="flex-1 m-0 min-h-0 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 h-full min-h-[300px] sm:min-h-[400px]">
            <div className="p-2 sm:p-3">
              {isLoadingMessages ? (
                <div className="space-y-2 sm:space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                      <Skeleton className="h-12 sm:h-14 w-2/3 rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : !messages || messages.length === 0 ? (
                <div className="text-center py-8 sm:py-12">
                  <MessageSquare className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-muted-foreground opacity-50 mb-3 sm:mb-4" />
                  <p className="text-sm sm:text-base text-muted-foreground">No messages yet</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                    SMS messages with {getContactDisplayName(contact)} will appear here
                  </p>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {messages.map((message) => (
                    <div 
                      key={message.id}
                      className={`flex ${message.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}
                      data-testid={`message-${message.id}`}
                    >
                      <div 
                        className={`max-w-[80%] sm:max-w-[75%] rounded-lg p-2 sm:p-3 ${
                          message.direction === 'inbound' 
                            ? 'bg-accent text-accent-foreground rounded-tl-sm' 
                            : 'bg-primary text-primary-foreground rounded-tr-sm'
                        }`}
                      >
                        <p className="text-xs sm:text-sm break-words">{message.body}</p>
                        <p className={`text-[9px] sm:text-[10px] mt-1 ${
                          message.direction === 'inbound' 
                            ? 'text-muted-foreground' 
                            : 'text-primary-foreground/70'
                        }`}>
                          {format(parseISO(message.createdAt), "MMM d, h:mm a")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="p-2 sm:p-3 border-t border-border">
            <div className="flex gap-2 items-end">
              <Textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder={`Send a message to ${getContactDisplayName(contact)}...`}
                className="min-h-[60px] max-h-[120px] resize-none text-xs sm:text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                data-testid="input-send-message"
              />
              <Button 
                size="icon" 
                onClick={handleSendMessage}
                disabled={!messageText.trim() || sendMessageMutation.isPending}
                data-testid="button-send-message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="details" className="flex-1 m-0 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-3 sm:p-4 space-y-4 sm:space-y-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <Avatar className="h-12 w-12 sm:h-16 sm:w-16 shrink-0">
                  <AvatarFallback className={`text-base sm:text-xl ${isMasterAdmin ? "bg-primary text-primary-foreground" : "bg-accent"}`}>
                    {getInitials(contact)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <div className="flex gap-2 mb-1">
                      <Input 
                        {...form.register("firstName")}
                        placeholder="First name"
                        className="font-semibold text-base sm:text-lg"
                        data-testid="input-edit-firstName"
                      />
                      <Input 
                        {...form.register("lastName")}
                        placeholder="Last name"
                        className="font-semibold text-base sm:text-lg"
                        data-testid="input-edit-lastName"
                      />
                    </div>
                  ) : (
                    <h3 className="font-semibold text-base sm:text-lg truncate">{getContactDisplayName(contact)}</h3>
                  )}
                  <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground">
                    <Phone className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                    <span className="truncate">{formatPhoneDisplay(contact.phoneNumber)}</span>
                  </div>
                  {isMasterAdmin && (
                    <Badge variant="default" className="mt-1.5 sm:mt-2 gap-0.5 sm:gap-1 text-[10px] sm:text-xs">
                      <Crown className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      Master Admin
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Access Level
                </h4>
                {isEditing && !isMasterAdmin ? (
                  <Select 
                    value={form.watch("accessLevel")} 
                    onValueChange={(v) => handleAccessLevelChange(v as AccessLevel)}
                  >
                    <SelectTrigger data-testid="select-access-level">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {accessLevels.map((level) => {
                        const levelConfig = ACCESS_LEVEL_CONFIG[level];
                        const LevelIcon = levelConfig.icon;
                        return (
                          <SelectItem key={level} value={level}>
                            <div className="flex items-center gap-2">
                              <LevelIcon className={`h-4 w-4 ${levelConfig.color}`} />
                              <span>{levelConfig.label}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className={`flex items-center gap-2 p-3 rounded-lg border border-border ${config.color}`}>
                    <config.icon className="h-5 w-5" />
                    <div>
                      <p className="font-medium">{config.label}</p>
                      <p className="text-xs text-muted-foreground">{config.description}</p>
                    </div>
                  </div>
                )}
              </div>
              
              {isEditing && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Relationship</h4>
                  <Input 
                    {...form.register("relationship")}
                    placeholder="e.g., Wife, Brother, Coworker"
                    data-testid="input-relationship"
                  />
                </div>
              )}
              
              {contact.relationship && !isEditing && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Relationship</h4>
                  <p className="text-sm text-muted-foreground">{contact.relationship}</p>
                </div>
              )}
              
              <div className="space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Permissions
                </h4>
                <div className="space-y-2">
                  <PermissionToggle
                    label="Personal Info"
                    description="Family details, preferences, notes about you"
                    icon={User}
                    checked={isEditing ? form.watch("canAccessPersonalInfo") : contact.canAccessPersonalInfo}
                    onCheckedChange={(v) => form.setValue("canAccessPersonalInfo", v)}
                    disabled={!isEditing || isMasterAdmin}
                  />
                  <PermissionToggle
                    label="Calendar"
                    description="View and create calendar events"
                    icon={Calendar}
                    checked={isEditing ? form.watch("canAccessCalendar") : contact.canAccessCalendar}
                    onCheckedChange={(v) => form.setValue("canAccessCalendar", v)}
                    disabled={!isEditing || isMasterAdmin}
                  />
                  <PermissionToggle
                    label="Tasks"
                    description="View and manage your to-do list"
                    icon={ListTodo}
                    checked={isEditing ? form.watch("canAccessTasks") : contact.canAccessTasks}
                    onCheckedChange={(v) => form.setValue("canAccessTasks", v)}
                    disabled={!isEditing || isMasterAdmin}
                  />
                  <PermissionToggle
                    label="Grocery List"
                    description="View and add to grocery list"
                    icon={ShoppingCart}
                    checked={isEditing ? form.watch("canAccessGrocery") : contact.canAccessGrocery}
                    onCheckedChange={(v) => form.setValue("canAccessGrocery", v)}
                    disabled={!isEditing || isMasterAdmin}
                  />
                  <PermissionToggle
                    label="Reminders"
                    description="Set reminders for you"
                    icon={Bell}
                    checked={isEditing ? form.watch("canSetReminders") : contact.canSetReminders}
                    onCheckedChange={(v) => form.setValue("canSetReminders", v)}
                    disabled={!isEditing || isMasterAdmin}
                  />
                </div>
              </div>
              
              {contact.conversations.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Conversation History ({contact.messageCount} messages)
                  </h4>
                  <div className="space-y-2">
                    {contact.conversations.map((conv) => (
                      <Card key={conv.id} className="p-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{conv.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(parseISO(conv.updatedAt), "MMM d, yyyy 'at' h:mm a")}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {conv.source.toUpperCase()}
                          </Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
              
              {isEditing && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Notes</h4>
                  <Input 
                    {...form.register("notes")}
                    placeholder="Additional notes about this contact"
                    data-testid="input-notes"
                  />
                </div>
              )}
              
              {contact.notes && !isEditing && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Notes</h4>
                  <p className="text-sm text-muted-foreground">{contact.notes}</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        
        <NotesTabContent contact={contact} />
      </Tabs>
    </div>
  );
}

const NOTE_TYPE_CONFIG = {
  interaction: { label: "Interaction", color: "text-blue-500" },
  observation: { label: "Observation", color: "text-green-500" },
  comment: { label: "Comment", color: "text-yellow-500" },
  fact: { label: "Fact", color: "text-purple-500" },
};

function NotesTabContent({ contact }: { contact: ContactWithStats }) {
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState<"interaction" | "observation" | "comment" | "fact">("observation");
  const { toast } = useToast();
  
  const { data: notes, isLoading } = useQuery<ContactNote[]>({
    queryKey: ['/api/contacts', contact.id, 'notes'],
    queryFn: async () => {
      const response = await fetch(`/api/contacts/${contact.id}/notes`);
      if (!response.ok) throw new Error('Failed to fetch notes');
      return response.json();
    },
  });
  
  const addNoteMutation = useMutation({
    mutationFn: async ({ content, noteType, createdBy }: { content: string; noteType: string; createdBy: string }) => {
      return apiRequest("POST", `/api/contacts/${contact.id}/notes`, { content, noteType, createdBy });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts', contact.id, 'notes'] });
      toast({ title: "Note added", description: "Your observation has been saved." });
      setNewNote("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to add note",
        variant: "destructive"
      });
    },
  });
  
  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest("DELETE", `/api/contacts/${contact.id}/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts', contact.id, 'notes'] });
      toast({ title: "Note deleted" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete note",
        variant: "destructive"
      });
    },
  });
  
  const handleAddNote = () => {
    if (!newNote.trim()) return;
    addNoteMutation.mutate({ content: newNote.trim(), noteType, createdBy: "nate" });
  };
  
  return (
    <TabsContent value="notes" className="flex-1 m-0 min-h-0 flex flex-col">
      <ScrollArea className="flex-1">
        <div className="p-3 sm:p-4 space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Select value={noteType} onValueChange={(v) => setNoteType(v as typeof noteType)}>
                <SelectTrigger className="w-32" data-testid="select-note-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="observation">Observation</SelectItem>
                  <SelectItem value="interaction">Interaction</SelectItem>
                  <SelectItem value="comment">Comment</SelectItem>
                  <SelectItem value="fact">Fact</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 items-end">
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a note about this contact..."
                className="min-h-[80px] resize-none text-sm"
                data-testid="input-add-note"
              />
              <Button 
                size="icon" 
                onClick={handleAddNote}
                disabled={!newNote.trim() || addNoteMutation.isPending}
                data-testid="button-add-note"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <StickyNote className="h-4 w-4" />
              Notes & Observations
            </h4>
            
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : !notes || notes.length === 0 ? (
              <div className="text-center py-8">
                <StickyNote className="h-10 w-10 mx-auto text-muted-foreground opacity-50 mb-3" />
                <p className="text-sm text-muted-foreground">No notes yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add observations, facts, or comments about this contact
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {notes.map((note) => {
                  const typeConfig = NOTE_TYPE_CONFIG[note.noteType as keyof typeof NOTE_TYPE_CONFIG] || NOTE_TYPE_CONFIG.observation;
                  return (
                    <Card key={note.id} className="p-3 group" data-testid={`note-${note.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <Badge variant="outline" className={`text-[10px] ${typeConfig.color}`}>
                              {typeConfig.label}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] gap-0.5">
                              {note.createdBy === "zeke" ? <Bot className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
                              {note.createdBy === "zeke" ? "ZEKE" : "Nate"}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              {format(parseISO(note.createdAt), "MMM d, yyyy")}
                            </span>
                          </div>
                          <p className="text-sm">{note.content}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={() => deleteNoteMutation.mutate(note.id)}
                          data-testid={`button-delete-note-${note.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </TabsContent>
  );
}

export default function ContactsPage() {
  const { toast } = useToast();
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [filterLevel, setFilterLevel] = useState<AccessLevel | "all">("all");
  
  const { data: contactsData, isLoading } = useQuery<{ contacts: ContactWithStats[] }>({
    queryKey: ["/api/contacts"],
  });
  
  const contacts = contactsData?.contacts;

  const createMutation = useMutation({
    mutationFn: async (data: ContactFormValues) => {
      return apiRequest("POST", "/api/contacts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setIsAddDialogOpen(false);
      toast({ title: "Contact added", description: "New contact has been created" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to create contact",
        variant: "destructive"
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ContactFormValues> }) => {
      return apiRequest("PATCH", `/api/contacts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact updated", description: "Changes have been saved" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update contact",
        variant: "destructive"
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/contacts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setSelectedContactId(null);
      toast({ title: "Contact deleted", description: "Contact has been removed" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete contact",
        variant: "destructive"
      });
    },
  });

  const addForm = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      middleName: "",
      phoneNumber: "",
      email: "",
      aiAssistantPhone: "",
      imageUrl: "",
      accessLevel: "unknown",
      relationship: "",
      notes: "",
      canAccessPersonalInfo: false,
      canAccessCalendar: false,
      canAccessTasks: false,
      canAccessGrocery: false,
      canSetReminders: false,
    },
  });

  const handleAddContact = (data: ContactFormValues) => {
    createMutation.mutate(data);
  };

  const handleAccessLevelChange = (level: AccessLevel) => {
    addForm.setValue("accessLevel", level);
    const defaults = defaultPermissionsByLevel[level];
    addForm.setValue("canAccessPersonalInfo", defaults.canAccessPersonalInfo);
    addForm.setValue("canAccessCalendar", defaults.canAccessCalendar);
    addForm.setValue("canAccessTasks", defaults.canAccessTasks);
    addForm.setValue("canAccessGrocery", defaults.canAccessGrocery);
    addForm.setValue("canSetReminders", defaults.canSetReminders);
  };

  const filteredContacts = contacts?.filter(c => 
    filterLevel === "all" || c.accessLevel === filterLevel
  ) || [];

  const selectedContact = contacts?.find(c => c.id === selectedContactId);

  const contactCounts = contacts?.reduce((acc, c) => {
    acc[c.accessLevel] = (acc[c.accessLevel] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <div className="flex h-full bg-background">
      <div className={`${selectedContact ? "hidden md:flex" : "flex"} flex-col flex-1 min-w-0 border-r border-border`}>
        <header className="flex items-center justify-between p-3 sm:p-4 gap-2 border-b border-border shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Users className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
            <h1 className="font-semibold text-base sm:text-lg">Contacts</h1>
          </div>
          <Button size="sm" className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3" onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-contact">
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
            Add
          </Button>
        </header>
        
        <div className="p-2.5 sm:p-4 border-b border-border">
          <Select value={filterLevel} onValueChange={(v) => setFilterLevel(v as AccessLevel | "all")}>
            <SelectTrigger className="h-9 sm:h-10 text-xs sm:text-sm" data-testid="select-filter-level">
              <SelectValue placeholder="Filter by access level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Contacts ({contacts?.length || 0})</SelectItem>
              {accessLevels.map((level) => {
                const levelConfig = ACCESS_LEVEL_CONFIG[level];
                const LevelIcon = levelConfig.icon;
                const count = contactCounts[level] || 0;
                return (
                  <SelectItem key={level} value={level}>
                    <div className="flex items-center gap-2">
                      <LevelIcon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${levelConfig.color}`} />
                      <span className="text-xs sm:text-sm">{levelConfig.label} ({count})</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2.5 sm:p-4 space-y-2 sm:space-y-3">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 sm:h-24 rounded-lg" />
              ))
            ) : filteredContacts.length === 0 ? (
              <div className="text-center py-8 sm:py-12">
                <Users className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-muted-foreground opacity-50 mb-3 sm:mb-4" />
                <p className="text-sm sm:text-base text-muted-foreground">
                  {filterLevel === "all" ? "No contacts yet" : `No ${filterLevel} contacts`}
                </p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                  Contacts are automatically created when someone texts ZEKE
                </p>
              </div>
            ) : (
              filteredContacts.map((contact) => (
                <ContactCard 
                  key={contact.id} 
                  contact={contact}
                  onClick={() => setSelectedContactId(contact.id)}
                  isSelected={selectedContactId === contact.id}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
      
      {selectedContact && (
        <div className="flex-1 w-full md:max-w-md lg:max-w-lg border-l border-border h-full overflow-hidden">
          <ContactDetailPanel
            contact={selectedContact}
            onClose={() => setSelectedContactId(null)}
            onUpdate={(data) => updateMutation.mutate({ id: selectedContact.id, data })}
            onDelete={() => deleteMutation.mutate(selectedContact.id)}
          />
        </div>
      )}
      
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription>
              Add a new contact and set their access permissions
            </DialogDescription>
          </DialogHeader>
          <Form {...addForm}>
            <form onSubmit={addForm.handleSubmit(handleAddContact)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={addForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John" {...field} data-testid="input-add-firstName" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={addForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Doe" {...field} data-testid="input-add-lastName" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={addForm.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="(555) 555-5555" {...field} data-testid="input-add-phone" />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={addForm.control}
                name="accessLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Access Level</FormLabel>
                    <Select value={field.value} onValueChange={(v) => handleAccessLevelChange(v as AccessLevel)}>
                      <FormControl>
                        <SelectTrigger data-testid="select-add-access-level">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {accessLevels.filter(l => l !== "admin").map((level) => {
                          const levelConfig = ACCESS_LEVEL_CONFIG[level];
                          const LevelIcon = levelConfig.icon;
                          return (
                            <SelectItem key={level} value={level}>
                              <div className="flex items-center gap-2">
                                <LevelIcon className={`h-4 w-4 ${levelConfig.color}`} />
                                <span>{levelConfig.label}</span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {ACCESS_LEVEL_CONFIG[field.value].description}
                    </FormDescription>
                  </FormItem>
                )}
              />
              
              <FormField
                control={addForm.control}
                name="relationship"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relationship (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Brother, Coworker" {...field} data-testid="input-add-relationship" />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-add-contact">
                  {createMutation.isPending ? "Adding..." : "Add Contact"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
