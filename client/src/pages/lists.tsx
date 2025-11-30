import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Trash2,
  ListTodo,
  Check,
  ArrowLeft,
  Pencil,
  Package,
  ShoppingBag,
  Gift,
  Briefcase,
  List,
  Users,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import type { CustomList, CustomListItem, CustomListWithItems, CustomListType, CustomListItemPriority } from "@shared/schema";

const LIST_TYPES: { value: CustomListType; label: string; icon: typeof ListTodo }[] = [
  { value: "todo", label: "To-Do", icon: ListTodo },
  { value: "packing", label: "Packing", icon: Briefcase },
  { value: "shopping", label: "Shopping", icon: ShoppingBag },
  { value: "wishlist", label: "Wishlist", icon: Gift },
  { value: "custom", label: "Custom", icon: List },
];

const PRIORITIES: { value: CustomListItemPriority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "text-muted-foreground" },
  { value: "medium", label: "Medium", color: "text-yellow-500" },
  { value: "high", label: "High", color: "text-red-500" },
];

const COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", 
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#78716c"
];

const FAMILY_MEMBERS = ["Nate", "ZEKE", "Shakita"];

const listFormSchema = z.object({
  name: z.string().min(1, "List name is required"),
  type: z.enum(["todo", "packing", "shopping", "wishlist", "custom"]).default("custom"),
  icon: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  isShared: z.boolean().default(false),
});

const itemFormSchema = z.object({
  content: z.string().min(1, "Item content is required"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  addedBy: z.string().optional().nullable(),
});

type ListFormValues = z.infer<typeof listFormSchema>;
type ItemFormValues = z.infer<typeof itemFormSchema>;

function getListIcon(type: CustomListType) {
  const config = LIST_TYPES.find(t => t.value === type);
  const Icon = config?.icon || List;
  return <Icon className="h-4 w-4" />;
}

function getPriorityBadge(priority: CustomListItemPriority | null | undefined, itemId?: string) {
  const config = PRIORITIES.find(p => p.value === priority) || PRIORITIES[1];
  return (
    <Badge 
      variant="outline" 
      className={`text-[10px] sm:text-xs ${config.color}`}
      data-testid={itemId ? `badge-priority-${itemId}` : undefined}
    >
      {config.label}
    </Badge>
  );
}

function ListItemRow({
  item,
  onToggle,
  onDelete,
  isDeleting,
}: {
  item: CustomListItem;
  onToggle: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <div
      className={`group flex items-center gap-2 sm:gap-3 px-2 sm:px-3 md:px-4 py-2 sm:py-3 rounded-lg border border-border hover-elevate transition-all ${
        item.checked ? "opacity-60" : ""
      }`}
      data-testid={`list-item-${item.id}`}
    >
      <Checkbox
        checked={item.checked}
        onCheckedChange={onToggle}
        className="h-4 w-4 sm:h-5 sm:w-5"
        data-testid={`checkbox-item-${item.id}`}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <span
            className={`text-xs sm:text-sm font-medium ${item.checked ? "line-through text-muted-foreground" : ""}`}
            data-testid={`text-item-content-${item.id}`}
          >
            {item.content}
          </span>
          {item.priority && getPriorityBadge(item.priority, item.id)}
        </div>
        {item.addedBy && (
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
            Added by {item.addedBy}
          </p>
        )}
      </div>

      <Button
        size="icon"
        variant="ghost"
        className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
        onClick={onDelete}
        disabled={isDeleting}
        data-testid={`button-delete-item-${item.id}`}
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
}

function ListCard({
  list,
  itemCount,
  onClick,
}: {
  list: CustomList;
  itemCount: number;
  onClick: () => void;
}) {
  return (
    <Card
      className="cursor-pointer hover-elevate transition-all"
      onClick={onClick}
      data-testid={`card-list-${list.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: list.color ? `${list.color}20` : 'hsl(var(--primary) / 0.1)' }}
          >
            <div style={{ color: list.color || 'hsl(var(--primary))' }}>
              {getListIcon(list.type)}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm truncate" data-testid={`text-list-name-${list.id}`}>
                {list.name}
              </h3>
              {list.isShared && (
                <Users className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-[10px]">
                {LIST_TYPES.find(t => t.value === list.type)?.label || "Custom"}
              </Badge>
              <span className="text-xs text-muted-foreground" data-testid={`text-item-count-${list.id}`}>
                {itemCount} item{itemCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          {list.color && (
            <div
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: list.color }}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Skeleton key={i} className="h-24 rounded-lg" />
      ))}
    </div>
  );
}

function ItemsSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-16 rounded-lg" />
      ))}
    </div>
  );
}

function CreateListDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const form = useForm<ListFormValues>({
    resolver: zodResolver(listFormSchema),
    defaultValues: {
      name: "",
      type: "custom",
      icon: null,
      color: null,
      isShared: false,
    },
  });

  const createListMutation = useMutation({
    mutationFn: async (data: ListFormValues) => {
      const response = await apiRequest("POST", "/api/lists", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lists"] });
      form.reset();
      onOpenChange(false);
      toast({
        title: "List created",
        description: "Your new list has been created",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create list",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ListFormValues) => {
    createListMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New List</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Enter list name..."
                      disabled={createListMutation.isPending}
                      data-testid="input-list-name"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-list-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LIST_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <type.icon className="h-4 w-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <FormControl>
                    <div className="flex flex-wrap gap-2">
                      {COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`h-8 w-8 rounded-md border-2 transition-all ${
                            field.value === color ? "border-foreground scale-110" : "border-transparent"
                          }`}
                          style={{ backgroundColor: color }}
                          onClick={() => field.onChange(color)}
                          data-testid={`color-${color}`}
                        />
                      ))}
                      <button
                        type="button"
                        className={`h-8 w-8 rounded-md border-2 border-dashed transition-all ${
                          !field.value ? "border-foreground" : "border-muted"
                        }`}
                        onClick={() => field.onChange(null)}
                        data-testid="color-none"
                      >
                        <span className="sr-only">No color</span>
                      </button>
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isShared"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Shared List</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Allow family members to view and edit
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-shared"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-create"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createListMutation.isPending}
                data-testid="button-create-list"
              >
                <Plus className="h-4 w-4 mr-1" />
                Create
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditListDialog({
  list,
  open,
  onOpenChange,
}: {
  list: CustomList;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const form = useForm<ListFormValues>({
    resolver: zodResolver(listFormSchema),
    defaultValues: {
      name: list.name,
      type: list.type,
      icon: list.icon,
      color: list.color,
      isShared: list.isShared,
    },
  });

  const updateListMutation = useMutation({
    mutationFn: async (data: ListFormValues) => {
      const response = await apiRequest("PATCH", `/api/lists/${list.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lists", list.id] });
      onOpenChange(false);
      toast({
        title: "List updated",
        description: "Your list has been updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update list",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ListFormValues) => {
    updateListMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit List</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Enter list name..."
                      disabled={updateListMutation.isPending}
                      data-testid="input-edit-list-name"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-edit-list-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LIST_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <type.icon className="h-4 w-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <FormControl>
                    <div className="flex flex-wrap gap-2">
                      {COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`h-8 w-8 rounded-md border-2 transition-all ${
                            field.value === color ? "border-foreground scale-110" : "border-transparent"
                          }`}
                          style={{ backgroundColor: color }}
                          onClick={() => field.onChange(color)}
                          data-testid={`edit-color-${color}`}
                        />
                      ))}
                      <button
                        type="button"
                        className={`h-8 w-8 rounded-md border-2 border-dashed transition-all ${
                          !field.value ? "border-foreground" : "border-muted"
                        }`}
                        onClick={() => field.onChange(null)}
                        data-testid="edit-color-none"
                      >
                        <span className="sr-only">No color</span>
                      </button>
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isShared"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Shared List</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Allow family members to view and edit
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-shared"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateListMutation.isPending}
                data-testid="button-save-list"
              >
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ListDetailView({
  listId,
  onBack,
}: {
  listId: string;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: {
      content: "",
      priority: "medium",
      addedBy: "Nate",
    },
  });

  const { data: listWithItems, isLoading } = useQuery<CustomListWithItems>({
    queryKey: ["/api/lists", listId],
  });

  const list = listWithItems;
  const items = listWithItems?.items || [];
  const uncheckedItems = items.filter((item) => !item.checked);
  const checkedItems = items.filter((item) => item.checked);
  const checkedCount = checkedItems.length;

  const addItemMutation = useMutation({
    mutationFn: async (data: ItemFormValues) => {
      const response = await apiRequest("POST", `/api/lists/${listId}/items`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lists", listId] });
      queryClient.invalidateQueries({ queryKey: ["/api/lists"] });
      form.reset({ content: "", priority: "medium", addedBy: form.getValues("addedBy") });
      toast({
        title: "Item added",
        description: "Added to the list",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await apiRequest("POST", `/api/lists/${listId}/items/${itemId}/toggle`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lists", listId] });
      queryClient.invalidateQueries({ queryKey: ["/api/lists"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("DELETE", `/api/lists/${listId}/items/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lists", listId] });
      queryClient.invalidateQueries({ queryKey: ["/api/lists"] });
      toast({
        title: "Item removed",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearCheckedMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/lists/${listId}/clear-checked`);
      return response.json();
    },
    onSuccess: (data: { deleted: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/lists", listId] });
      queryClient.invalidateQueries({ queryKey: ["/api/lists"] });
      toast({
        title: "Cleared checked items",
        description: `Removed ${data.deleted} item${data.deleted !== 1 ? "s" : ""}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to clear items",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/lists/${listId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lists"] });
      toast({
        title: "List deleted",
      });
      onBack();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete list",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ItemFormValues) => {
    addItemMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <header className="h-11 sm:h-14 border-b border-border flex items-center gap-2 px-3 sm:px-4 md:px-6 shrink-0">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-6 w-32" />
        </header>
        <div className="flex-1 p-4">
          <ItemsSkeleton />
        </div>
      </div>
    );
  }

  if (!list) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-muted-foreground">List not found</p>
        <Button variant="ghost" onClick={onBack}>
          Go back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-11 sm:h-14 border-b border-border flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={onBack}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div
            className="h-6 w-6 sm:h-8 sm:w-8 rounded flex items-center justify-center"
            style={{ backgroundColor: list.color ? `${list.color}20` : 'hsl(var(--primary) / 0.1)' }}
          >
            <div style={{ color: list.color || 'hsl(var(--primary))' }}>
              {getListIcon(list.type)}
            </div>
          </div>
          <h1 className="text-base sm:text-lg md:text-xl font-semibold truncate" data-testid="text-list-title">
            {list.name}
          </h1>
          {list.isShared && (
            <Badge variant="secondary" className="text-[10px] sm:text-xs gap-1">
              <Users className="h-3 w-3" />
              Shared
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {checkedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearCheckedMutation.mutate()}
              disabled={clearCheckedMutation.isPending}
              className="gap-1 sm:gap-1.5 text-xs sm:text-sm"
              data-testid="button-clear-checked"
            >
              <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Clear</span> {checkedCount}
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setEditDialogOpen(true)}
            data-testid={`button-edit-list-${listId}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setDeleteDialogOpen(true)}
            data-testid={`button-delete-list-${listId}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col max-w-2xl mx-auto w-full">
        <div className="p-2 sm:p-3 md:p-4 border-b border-border shrink-0">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2 sm:space-y-3">
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Add an item..."
                        className="h-9 sm:h-11 text-sm sm:text-base"
                        disabled={addItemMutation.isPending}
                        data-testid="input-item-content"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-[100px] sm:w-[120px] h-8 sm:h-9 text-xs sm:text-sm" data-testid="select-priority">
                            <SelectValue placeholder="Priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PRIORITIES.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="addedBy"
                  render={({ field }) => (
                    <FormItem>
                      <Select value={field.value || ""} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-[90px] sm:w-[120px] h-8 sm:h-9 text-xs sm:text-sm" data-testid="select-added-by">
                            <SelectValue placeholder="Added by" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {FAMILY_MEMBERS.map((member) => (
                            <SelectItem key={member} value={member}>
                              {member}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={addItemMutation.isPending}
                  className="gap-1.5 flex-1 sm:flex-none"
                  data-testid="button-add-item"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </form>
          </Form>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 sm:p-3 md:p-4 space-y-3 sm:space-y-4">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-center">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-primary/10 flex items-center justify-center mb-3 sm:mb-4">
                  <Package className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
                </div>
                <h2 className="text-base sm:text-lg font-medium mb-1" data-testid="text-empty-items">
                  No items yet
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground px-4">
                  Add items to your list above
                </p>
              </div>
            ) : (
              <>
                {uncheckedItems.length > 0 && (
                  <div className="space-y-1.5 sm:space-y-2">
                    <h2 className="text-xs sm:text-sm font-medium text-muted-foreground px-1">
                      To Do ({uncheckedItems.length})
                    </h2>
                    {uncheckedItems.map((item) => (
                      <ListItemRow
                        key={item.id}
                        item={item}
                        onToggle={() => toggleItemMutation.mutate(item.id)}
                        onDelete={() => deleteItemMutation.mutate(item.id)}
                        isDeleting={deleteItemMutation.isPending}
                      />
                    ))}
                  </div>
                )}

                {checkedItems.length > 0 && (
                  <div className="space-y-1.5 sm:space-y-2 mt-4 sm:mt-6">
                    <h2 className="text-xs sm:text-sm font-medium text-muted-foreground px-1">
                      Completed ({checkedItems.length})
                    </h2>
                    {checkedItems.map((item) => (
                      <ListItemRow
                        key={item.id}
                        item={item}
                        onToggle={() => toggleItemMutation.mutate(item.id)}
                        onDelete={() => deleteItemMutation.mutate(item.id)}
                        isDeleting={deleteItemMutation.isPending}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      <EditListDialog list={list} open={editDialogOpen} onOpenChange={setEditDialogOpen} />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete List</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{list.name}"? This action cannot be undone and all items in the list will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteListMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function ListsPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  const { data: lists, isLoading } = useQuery<CustomList[]>({
    queryKey: ["/api/lists"],
  });

  const { data: allListsWithItems } = useQuery<CustomListWithItems[]>({
    queryKey: ["/api/lists/with-items"],
    enabled: false,
  });

  const getItemCount = (listId: string) => {
    return 0;
  };

  if (selectedListId) {
    return (
      <div className="flex flex-col h-screen h-[100dvh] bg-background" data-testid="lists-page">
        <ListDetailView listId={selectedListId} onBack={() => setSelectedListId(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen h-[100dvh] bg-background" data-testid="lists-page">
      <header className="h-11 sm:h-14 border-b border-border flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <List className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          <h1 className="text-base sm:text-lg md:text-xl font-semibold" data-testid="text-page-title">
            My Lists
          </h1>
        </div>

        <Button
          size="sm"
          onClick={() => setCreateDialogOpen(true)}
          className="gap-1.5 text-xs sm:text-sm"
          data-testid="button-new-list"
        >
          <Plus className="h-4 w-4" />
          New List
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-3 sm:p-4 md:p-6">
          {isLoading ? (
            <ListSkeleton />
          ) : !lists || lists.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center">
              <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <List className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
              </div>
              <h2 className="text-lg sm:text-xl font-medium mb-2" data-testid="text-empty-state">
                No lists yet
              </h2>
              <p className="text-sm text-muted-foreground mb-4 px-4 max-w-md">
                Create your first list to get started. You can create to-do lists, packing lists, shopping lists, and more.
              </p>
              <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-list">
                <Plus className="h-4 w-4 mr-1.5" />
                Create your first list
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {lists.map((list) => (
                <ListCard
                  key={list.id}
                  list={list}
                  itemCount={getItemCount(list.id)}
                  onClick={() => setSelectedListId(list.id)}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <CreateListDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
    </div>
  );
}
