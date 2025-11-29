import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Plus, 
  Trash2, 
  ArrowLeft,
  Users,
  Phone,
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
  Eye
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
import { Link } from "wouter";
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
import type { Contact, Conversation, AccessLevel } from "@shared/schema";
import { accessLevels, defaultPermissionsByLevel, MASTER_ADMIN_PHONE } from "@shared/schema";
import { format, parseISO } from "date-fns";

type ContactWithStats = Contact & {
  messageCount: number;
  conversations: Conversation[];
};

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
  name: z.string().min(1, "Name is required"),
  phoneNumber: z.string().min(10, "Valid phone number required"),
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

function getInitials(name: string): string {
  return name
    .split(" ")
    .map(part => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
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
      className={`p-3 md:p-4 cursor-pointer hover-elevate transition-all ${isSelected ? "ring-2 ring-primary" : ""}`}
      onClick={onClick}
      data-testid={`contact-card-${contact.id}`}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className={`${isMasterAdmin ? "bg-primary text-primary-foreground" : "bg-accent"}`}>
            {getInitials(contact.name)}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate" data-testid={`text-contact-name-${contact.id}`}>
              {contact.name}
            </span>
            {isMasterAdmin && (
              <Badge variant="default" className="text-xs gap-1">
                <Crown className="h-3 w-3" />
                Master
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <Phone className="h-3 w-3" />
            <span>{formatPhoneDisplay(contact.phoneNumber)}</span>
          </div>
          
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="outline" className={`text-xs gap-1 ${config.color}`}>
              <Icon className="h-3 w-3" />
              {config.label}
            </Badge>
            
            {contact.messageCount > 0 && (
              <Badge variant="secondary" className="text-xs gap-1">
                <MessageSquare className="h-3 w-3" />
                {contact.messageCount}
              </Badge>
            )}
          </div>
        </div>
        
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
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
    <div className="flex items-center justify-between p-3 rounded-lg border border-border">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${checked ? "bg-primary/20" : "bg-muted"}`}>
          <Icon className={`h-4 w-4 ${checked ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch 
        checked={checked} 
        onCheckedChange={onCheckedChange}
        disabled={disabled}
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
  const config = ACCESS_LEVEL_CONFIG[contact.accessLevel];
  const isMasterAdmin = contact.phoneNumber.replace(/\D/g, "").endsWith(MASTER_ADMIN_PHONE);
  
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: contact.name,
      phoneNumber: contact.phoneNumber,
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
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-detail">
            <X className="h-4 w-4" />
          </Button>
          <h2 className="font-semibold">Contact Details</h2>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} data-testid="button-save-contact">
                <Check className="h-4 w-4 mr-1" />
                Save
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)} data-testid="button-edit-contact">
                <Pencil className="h-4 w-4" />
              </Button>
              {!isMasterAdmin && (
                <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive" data-testid="button-delete-contact">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className={`text-xl ${isMasterAdmin ? "bg-primary text-primary-foreground" : "bg-accent"}`}>
                {getInitials(contact.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              {isEditing ? (
                <Input 
                  {...form.register("name")}
                  className="font-semibold text-lg mb-1"
                  data-testid="input-edit-name"
                />
              ) : (
                <h3 className="font-semibold text-lg">{contact.name}</h3>
              )}
              <div className="flex items-center gap-1 text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>{formatPhoneDisplay(contact.phoneNumber)}</span>
              </div>
              {isMasterAdmin && (
                <Badge variant="default" className="mt-2 gap-1">
                  <Crown className="h-3 w-3" />
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
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{conv.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(conv.updatedAt), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
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
    </div>
  );
}

export default function ContactsPage() {
  const { toast } = useToast();
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [filterLevel, setFilterLevel] = useState<AccessLevel | "all">("all");
  
  const { data: contacts, isLoading } = useQuery<ContactWithStats[]>({
    queryKey: ["/api/contacts"],
  });

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
      name: "",
      phoneNumber: "",
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
    <div className="flex h-screen bg-background">
      <div className={`${selectedContact ? "hidden md:flex" : "flex"} flex-col flex-1 border-r border-border`}>
        <header className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back-home">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h1 className="font-semibold text-lg">Contacts</h1>
            </div>
          </div>
          <Button size="sm" onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-contact">
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </header>
        
        <div className="p-4 border-b border-border">
          <Select value={filterLevel} onValueChange={(v) => setFilterLevel(v as AccessLevel | "all")}>
            <SelectTrigger data-testid="select-filter-level">
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
                      <LevelIcon className={`h-4 w-4 ${levelConfig.color}`} />
                      <span>{levelConfig.label} ({count})</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))
            ) : filteredContacts.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-4" />
                <p className="text-muted-foreground">
                  {filterLevel === "all" ? "No contacts yet" : `No ${filterLevel} contacts`}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
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
        <div className="flex-1 md:max-w-md lg:max-w-lg border-l border-border">
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
              <FormField
                control={addForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} data-testid="input-add-name" />
                    </FormControl>
                  </FormItem>
                )}
              />
              
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
