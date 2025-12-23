import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
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
  ShoppingCart,
  Check,
  Package,
  Clock
} from "lucide-react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
} from "@/components/ui/form";
import type { GroceryItem } from "@shared/schema";

const CATEGORIES = [
  "Produce",
  "Dairy",
  "Meat",
  "Bakery",
  "Frozen",
  "Beverages",
  "Snacks",
  "Household",
  "Other"
];

const FAMILY_MEMBERS = ["Nate", "ZEKE", "Shakita"];

const groceryFormSchema = z.object({
  name: z.string().min(1, "Item name is required"),
  quantity: z.string().default("1"),
  category: z.string().default("Other"),
  addedBy: z.string().default("Nate"),
});

type GroceryFormValues = z.infer<typeof groceryFormSchema>;

const AUTO_CLEAR_OPTIONS = [
  { value: "0", label: "Never" },
  { value: "6", label: "After 6 hours" },
  { value: "12", label: "After 12 hours" },
  { value: "24", label: "After 24 hours" },
  { value: "48", label: "After 2 days" },
  { value: "168", label: "After 7 days" },
];

function GroceryItemRow({ 
  item, 
  onToggle,
  onDelete,
  isDeleting
}: { 
  item: GroceryItem; 
  onToggle: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    onDelete();
  };

  return (
    <>
      <div 
        className={`group flex items-center gap-2 sm:gap-3 px-2 sm:px-3 md:px-4 py-2 sm:py-3 rounded-lg border border-border hover-elevate transition-all ${
          item.purchased ? "opacity-60" : ""
        }`}
        data-testid={`grocery-item-${item.id}`}
      >
        <Checkbox
          checked={item.purchased}
          onCheckedChange={onToggle}
          className="h-4 w-4 sm:h-5 sm:w-5"
          data-testid={`checkbox-item-${item.id}`}
        />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <span 
              className={`text-xs sm:text-sm font-medium ${item.purchased ? "line-through text-muted-foreground" : ""}`}
              data-testid={`text-item-name-${item.id}`}
            >
              {item.name}
            </span>
            {item.quantity && item.quantity !== "1" && (
              <Badge variant="secondary" className="text-[10px] sm:text-xs">
                x{item.quantity}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] sm:text-xs">
              {item.category}
            </Badge>
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
            Added by {item.addedBy}
          </p>
        </div>
        
        <Button
          size="icon"
          variant="ghost"
          className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          onClick={() => setDeleteConfirmOpen(true)}
          disabled={isDeleting}
          data-testid={`button-delete-item-${item.id}`}
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove item?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{item.name}" from the grocery list? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function GroceryListSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-16 rounded-lg" />
      ))}
    </div>
  );
}

export default function GroceryPage() {
  const { toast } = useToast();
  
  const form = useForm<GroceryFormValues>({
    resolver: zodResolver(groceryFormSchema),
    defaultValues: {
      name: "",
      quantity: "1",
      category: "Other",
      addedBy: "Nate",
    },
  });

  const { data: items, isLoading } = useQuery<GroceryItem[]>({
    queryKey: ["/api/grocery"],
  });

  const { data: settings } = useQuery<{ autoClearHours: number }>({
    queryKey: ["/api/grocery/settings"],
  });

  const unpurchasedItems = items?.filter(item => !item.purchased) || [];
  const purchasedItems = items?.filter(item => item.purchased) || [];
  const totalItems = items?.length || 0;
  const completedCount = purchasedItems.length;

  const addItemMutation = useMutation({
    mutationFn: async (data: GroceryFormValues) => {
      const response = await apiRequest("POST", "/api/grocery", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grocery"] });
      form.reset({ name: "", quantity: "1", category: form.getValues("category"), addedBy: form.getValues("addedBy") });
      toast({
        title: "Item added",
        description: "Added to the grocery list",
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
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/grocery/${id}/toggle`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grocery"] });
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
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/grocery/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grocery"] });
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

  const clearPurchasedMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/grocery/clear-purchased");
      return response.json();
    },
    onSuccess: (data: { deleted: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/grocery"] });
      toast({
        title: "Cleared purchased items",
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

  const updateSettingsMutation = useMutation({
    mutationFn: async (autoClearHours: number) => {
      const response = await apiRequest("POST", "/api/grocery/settings", { autoClearHours });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grocery/settings"] });
      toast({
        title: "Settings updated",
        description: "Auto-clear setting saved",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: GroceryFormValues) => {
    addItemMutation.mutate(data);
  };

  const handleAutoClearChange = (value: string) => {
    updateSettingsMutation.mutate(parseInt(value, 10));
  };

  return (
    <div className="flex flex-col h-screen h-[100dvh] bg-background" data-testid="grocery-page">
      <header className="h-11 sm:h-14 border-b border-border flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          <h1 className="text-base sm:text-lg md:text-xl font-semibold" data-testid="text-page-title">Grocery List</h1>
        </div>
        
        {completedCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearPurchasedMutation.mutate()}
            disabled={clearPurchasedMutation.isPending}
            className="gap-1 sm:gap-1.5 text-xs sm:text-sm"
            data-testid="button-clear-purchased"
          >
            <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden xs:inline">Clear</span> {completedCount}
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-hidden flex flex-col max-w-2xl mx-auto w-full">
        <div className="p-2 sm:p-3 md:p-4 border-b border-border shrink-0">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2 sm:space-y-3">
              <div className="flex gap-1.5 sm:gap-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Add an item..."
                          className="h-9 sm:h-11 text-sm sm:text-base"
                          disabled={addItemMutation.isPending}
                          data-testid="input-new-item"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Qty"
                          className="w-12 sm:w-16 h-9 sm:h-11 text-center text-sm sm:text-base"
                          disabled={addItemMutation.isPending}
                          data-testid="input-quantity"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-[100px] sm:w-[130px] h-8 sm:h-9 text-xs sm:text-sm" data-testid="select-category">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
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
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-[90px] sm:w-[120px] h-8 sm:h-9 text-xs sm:text-sm" data-testid="select-added-by">
                            <SelectValue placeholder="Added by" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {FAMILY_MEMBERS.map((member) => (
                            <SelectItem key={member} value={member}>{member}</SelectItem>
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
            {isLoading ? (
              <GroceryListSkeleton />
            ) : totalItems === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-center">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-primary/10 flex items-center justify-center mb-3 sm:mb-4">
                  <Package className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
                </div>
                <h2 className="text-base sm:text-lg font-medium mb-1" data-testid="text-empty-state">No items yet</h2>
                <p className="text-xs sm:text-sm text-muted-foreground px-4">Add items to your grocery list above</p>
              </div>
            ) : (
              <>
                {unpurchasedItems.length > 0 && (
                  <div className="space-y-1.5 sm:space-y-2">
                    <h2 className="text-xs sm:text-sm font-medium text-muted-foreground px-1">
                      To Buy ({unpurchasedItems.length})
                    </h2>
                    {unpurchasedItems.map((item) => (
                      <GroceryItemRow
                        key={item.id}
                        item={item}
                        onToggle={() => toggleItemMutation.mutate(item.id)}
                        onDelete={() => deleteItemMutation.mutate(item.id)}
                        isDeleting={deleteItemMutation.isPending}
                      />
                    ))}
                  </div>
                )}
                
                {purchasedItems.length > 0 && (
                  <div className="space-y-1.5 sm:space-y-2 mt-4 sm:mt-6">
                    <div className="flex items-center justify-between gap-2 px-1">
                      <h2 className="text-xs sm:text-sm font-medium text-muted-foreground">
                        Purchased ({purchasedItems.length})
                      </h2>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => clearPurchasedMutation.mutate()}
                        disabled={clearPurchasedMutation.isPending}
                        className="gap-1 sm:gap-1.5 text-xs"
                        data-testid="button-clear-all-purchased"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear All
                      </Button>
                    </div>
                    {purchasedItems.map((item) => (
                      <GroceryItemRow
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

        <div className="p-2 sm:p-3 md:p-4 border-t border-border shrink-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              Shared list for Nate, ZEKE, and Shakita
            </p>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
              <span className="text-[10px] sm:text-xs text-muted-foreground" data-testid="text-auto-clear-setting">
                Auto-clear:
              </span>
              <Select 
                value={String(settings?.autoClearHours ?? 0)} 
                onValueChange={handleAutoClearChange}
                disabled={updateSettingsMutation.isPending}
              >
                <SelectTrigger 
                  className="h-6 sm:h-7 w-[100px] sm:w-[130px] text-[10px] sm:text-xs" 
                  data-testid="select-auto-clear"
                >
                  <SelectValue placeholder="Never" />
                </SelectTrigger>
                <SelectContent>
                  {AUTO_CLEAR_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
