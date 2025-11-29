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
  Plus, 
  Trash2, 
  ShoppingCart,
  Check,
  Package
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
  return (
    <div 
      className={`group flex items-center gap-3 px-3 md:px-4 py-3 rounded-lg border border-border hover-elevate transition-all ${
        item.purchased ? "opacity-60" : ""
      }`}
      data-testid={`grocery-item-${item.id}`}
    >
      <Checkbox
        checked={item.purchased}
        onCheckedChange={onToggle}
        className="h-5 w-5"
        data-testid={`checkbox-item-${item.id}`}
      />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span 
            className={`text-sm font-medium ${item.purchased ? "line-through text-muted-foreground" : ""}`}
            data-testid={`text-item-name-${item.id}`}
          >
            {item.name}
          </span>
          {item.quantity && item.quantity !== "1" && (
            <Badge variant="secondary" className="text-xs">
              x{item.quantity}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            {item.category}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Added by {item.addedBy}
        </p>
      </div>
      
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onDelete}
        disabled={isDeleting}
        data-testid={`button-delete-item-${item.id}`}
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
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

  const onSubmit = (data: GroceryFormValues) => {
    addItemMutation.mutate(data);
  };

  const unpurchasedItems = items?.filter(item => !item.purchased) || [];
  const purchasedItems = items?.filter(item => item.purchased) || [];
  const totalItems = items?.length || 0;
  const completedCount = purchasedItems.length;

  return (
    <div className="flex flex-col h-screen h-[100dvh] bg-background" data-testid="grocery-page">
      <header className="h-14 md:h-16 border-b border-border flex items-center justify-between gap-3 px-3 md:px-6 shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <h1 className="text-lg md:text-xl font-semibold" data-testid="text-page-title">Grocery List</h1>
        </div>
        
        {completedCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearPurchasedMutation.mutate()}
            disabled={clearPurchasedMutation.isPending}
            className="gap-1.5"
            data-testid="button-clear-purchased"
          >
            <Check className="h-4 w-4" />
            Clear {completedCount}
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-hidden flex flex-col max-w-2xl mx-auto w-full">
        <div className="p-3 md:p-4 border-b border-border shrink-0">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <div className="flex gap-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Add an item..."
                          className="h-11"
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
                          className="w-16 h-11 text-center"
                          disabled={addItemMutation.isPending}
                          data-testid="input-quantity"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="flex gap-2 flex-wrap">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-[130px] h-9" data-testid="select-category">
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
                          <SelectTrigger className="w-[120px] h-9" data-testid="select-added-by">
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
                  className="gap-1.5 h-9 flex-1 sm:flex-none"
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
          <div className="p-3 md:p-4 space-y-4">
            {isLoading ? (
              <GroceryListSkeleton />
            ) : totalItems === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Package className="h-7 w-7 text-primary" />
                </div>
                <h2 className="text-lg font-medium mb-1" data-testid="text-empty-state">No items yet</h2>
                <p className="text-sm text-muted-foreground">Add items to your grocery list above</p>
              </div>
            ) : (
              <>
                {unpurchasedItems.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-sm font-medium text-muted-foreground px-1">
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
                  <div className="space-y-2 mt-6">
                    <h2 className="text-sm font-medium text-muted-foreground px-1">
                      Purchased ({purchasedItems.length})
                    </h2>
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

        <div className="p-3 md:p-4 border-t border-border text-center shrink-0">
          <p className="text-xs text-muted-foreground">
            Shared list for Nate, ZEKE, and Shakita
          </p>
        </div>
      </div>
    </div>
  );
}
