import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  Utensils,
  Plus,
  Heart,
  Clock,
  Star,
  ChefHat,
  Search,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  Calendar,
  ShoppingCart,
} from "lucide-react";
import { format, startOfMonth, isAfter } from "date-fns";
import type {
  FamilyMember,
  FoodPreference,
  DietaryRestriction,
  SavedRecipe,
  MealHistory,
  FoodPreferenceLevel,
  FoodItemType,
  DietaryRestrictionType,
  MealType,
} from "@shared/schema";

const PREFERENCE_LEVELS: { value: FoodPreferenceLevel; label: string; color: string }[] = [
  { value: "love", label: "Loves", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
  { value: "like", label: "Likes", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  { value: "dislike", label: "Dislikes", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  { value: "allergic", label: "Allergic", color: "bg-red-500/20 text-red-400 border-red-500/30" },
];

const ITEM_TYPES: { value: FoodItemType; label: string }[] = [
  { value: "ingredient", label: "Ingredient" },
  { value: "dish", label: "Dish" },
  { value: "cuisine", label: "Cuisine" },
];

const RESTRICTION_TYPES: { value: DietaryRestrictionType; label: string }[] = [
  { value: "allergy", label: "Allergy" },
  { value: "intolerance", label: "Intolerance" },
  { value: "religious", label: "Religious" },
  { value: "health", label: "Health" },
  { value: "preference", label: "Preference" },
];

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

const preferenceFormSchema = z.object({
  memberId: z.string().min(1, "Member is required"),
  itemType: z.enum(["ingredient", "dish", "cuisine"]),
  itemName: z.string().min(1, "Item name is required"),
  preference: z.enum(["love", "like", "neutral", "dislike", "allergic"]),
  notes: z.string().optional(),
});

const restrictionFormSchema = z.object({
  memberId: z.string().min(1, "Member is required"),
  restrictionType: z.enum(["allergy", "intolerance", "religious", "health", "preference"]),
  restrictionName: z.string().min(1, "Restriction name is required"),
  severity: z.enum(["strict", "moderate", "mild"]).default("strict"),
  notes: z.string().optional(),
});

const logMealFormSchema = z.object({
  name: z.string().min(1, "Meal name is required"),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  cuisine: z.string().optional(),
  rating: z.number().min(1).max(5).optional(),
  notes: z.string().optional(),
});

type PreferenceFormValues = z.infer<typeof preferenceFormSchema>;
type RestrictionFormValues = z.infer<typeof restrictionFormSchema>;
type LogMealFormValues = z.infer<typeof logMealFormSchema>;

function getPreferenceBadgeColor(preference: FoodPreferenceLevel): string {
  const config = PREFERENCE_LEVELS.find(p => p.value === preference);
  return config?.color || "";
}

function StarRating({ rating, onChange, readonly = false, size = "default" }: {
  rating: number | null;
  onChange?: (rating: number) => void;
  readonly?: boolean;
  size?: "default" | "small";
}) {
  const stars = [1, 2, 3, 4, 5];
  const iconSize = size === "small" ? "h-3 w-3" : "h-4 w-4";
  
  return (
    <div className="flex gap-0.5">
      {stars.map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(star)}
          className={`${readonly ? "cursor-default" : "cursor-pointer hover-elevate"} p-0.5 rounded`}
          data-testid={`star-${star}`}
        >
          <Star
            className={`${iconSize} ${
              (rating || 0) >= star
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

function PreferenceCard({
  member,
  preferences,
  restrictions,
  onAddPreference,
}: {
  member: FamilyMember;
  preferences: FoodPreference[];
  restrictions: DietaryRestriction[];
  onAddPreference: () => void;
}) {
  const memberPrefs = preferences.filter(p => p.memberId === member.id);
  const memberRestrictions = restrictions.filter(r => r.memberId === member.id);
  
  const loved = memberPrefs.filter(p => p.preference === "love");
  const liked = memberPrefs.filter(p => p.preference === "like");
  const disliked = memberPrefs.filter(p => p.preference === "dislike");
  const allergies = memberRestrictions.filter(r => r.restrictionType === "allergy");

  return (
    <Card className="overflow-hidden" data-testid={`card-member-${member.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg" data-testid={`text-member-name-${member.id}`}>
            {member.name}
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={onAddPreference}
            className="gap-1"
            data-testid={`button-add-preference-${member.id}`}
          >
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loved.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
              <Heart className="h-3 w-3 fill-pink-400 text-pink-400" /> Loves
            </p>
            <div className="flex flex-wrap gap-1.5">
              {loved.map(p => (
                <Badge
                  key={p.id}
                  variant="outline"
                  className={getPreferenceBadgeColor("love")}
                  data-testid={`badge-love-${p.id}`}
                >
                  {p.itemName}
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {liked.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
              <ThumbsUp className="h-3 w-3 text-green-400" /> Likes
            </p>
            <div className="flex flex-wrap gap-1.5">
              {liked.map(p => (
                <Badge
                  key={p.id}
                  variant="outline"
                  className={getPreferenceBadgeColor("like")}
                  data-testid={`badge-like-${p.id}`}
                >
                  {p.itemName}
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {disliked.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
              <ThumbsDown className="h-3 w-3 text-orange-400" /> Dislikes
            </p>
            <div className="flex flex-wrap gap-1.5">
              {disliked.map(p => (
                <Badge
                  key={p.id}
                  variant="outline"
                  className={getPreferenceBadgeColor("dislike")}
                  data-testid={`badge-dislike-${p.id}`}
                >
                  {p.itemName}
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {allergies.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-red-400" /> Allergies
            </p>
            <div className="flex flex-wrap gap-1.5">
              {allergies.map(r => (
                <Badge
                  key={r.id}
                  variant="outline"
                  className={getPreferenceBadgeColor("allergic")}
                  data-testid={`badge-allergy-${r.id}`}
                >
                  {r.restrictionName}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {memberPrefs.length === 0 && memberRestrictions.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No preferences recorded yet
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AddPreferenceDialog({
  open,
  onOpenChange,
  familyMembers,
  selectedMemberId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  familyMembers: FamilyMember[];
  selectedMemberId?: string;
}) {
  const { toast } = useToast();
  const [isRestriction, setIsRestriction] = useState(false);

  const prefForm = useForm<PreferenceFormValues>({
    resolver: zodResolver(preferenceFormSchema),
    defaultValues: {
      memberId: selectedMemberId || "",
      itemType: "ingredient",
      itemName: "",
      preference: "like",
      notes: "",
    },
  });

  const restrictionForm = useForm<RestrictionFormValues>({
    resolver: zodResolver(restrictionFormSchema),
    defaultValues: {
      memberId: selectedMemberId || "",
      restrictionType: "allergy",
      restrictionName: "",
      severity: "strict",
      notes: "",
    },
  });

  const addPreferenceMutation = useMutation({
    mutationFn: async (data: PreferenceFormValues) => {
      const response = await apiRequest("POST", "/api/food/preferences", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/food/preferences"] });
      prefForm.reset();
      onOpenChange(false);
      toast({ title: "Preference added" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add preference", description: error.message, variant: "destructive" });
    },
  });

  const addRestrictionMutation = useMutation({
    mutationFn: async (data: RestrictionFormValues) => {
      const response = await apiRequest("POST", "/api/food/restrictions", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/food/restrictions"] });
      restrictionForm.reset();
      onOpenChange(false);
      toast({ title: "Restriction added" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add restriction", description: error.message, variant: "destructive" });
    },
  });

  const onSubmitPreference = (data: PreferenceFormValues) => {
    addPreferenceMutation.mutate(data);
  };

  const onSubmitRestriction = (data: RestrictionFormValues) => {
    addRestrictionMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Food Preference</DialogTitle>
          <DialogDescription>Record a food preference or dietary restriction for a family member.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 py-2">
          <Label htmlFor="type-switch" className="text-sm">Food Preference</Label>
          <Switch
            id="type-switch"
            checked={isRestriction}
            onCheckedChange={setIsRestriction}
            data-testid="switch-preference-type"
          />
          <Label htmlFor="type-switch" className="text-sm">Dietary Restriction</Label>
        </div>

        {!isRestriction ? (
          <Form {...prefForm}>
            <form onSubmit={prefForm.handleSubmit(onSubmitPreference)} className="space-y-4">
              <FormField
                control={prefForm.control}
                name="memberId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Family Member</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-member">
                          <SelectValue placeholder="Select member" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {familyMembers.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={prefForm.control}
                name="itemType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-item-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ITEM_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={prefForm.control}
                name="itemName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Mushrooms, Pizza, Thai" {...field} data-testid="input-item-name" />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={prefForm.control}
                name="preference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preference</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-preference">
                          <SelectValue placeholder="Select preference" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PREFERENCE_LEVELS.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={addPreferenceMutation.isPending}
                data-testid="button-submit-preference"
              >
                Add Preference
              </Button>
            </form>
          </Form>
        ) : (
          <Form {...restrictionForm}>
            <form onSubmit={restrictionForm.handleSubmit(onSubmitRestriction)} className="space-y-4">
              <FormField
                control={restrictionForm.control}
                name="memberId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Family Member</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-restriction-member">
                          <SelectValue placeholder="Select member" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {familyMembers.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={restrictionForm.control}
                name="restrictionType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Restriction Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-restriction-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {RESTRICTION_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={restrictionForm.control}
                name="restrictionName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Restriction Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Peanuts, Gluten, Vegetarian" {...field} data-testid="input-restriction-name" />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={restrictionForm.control}
                name="severity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Severity</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-severity">
                          <SelectValue placeholder="Select severity" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="strict">Strict</SelectItem>
                        <SelectItem value="moderate">Moderate</SelectItem>
                        <SelectItem value="mild">Mild</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={addRestrictionMutation.isPending}
                data-testid="button-submit-restriction"
              >
                Add Restriction
              </Button>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecipeCard({
  recipe,
  onToggleFavorite,
  onCook,
  onClick,
}: {
  recipe: SavedRecipe;
  onToggleFavorite: () => void;
  onCook: () => void;
  onClick: () => void;
}) {
  const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);

  return (
    <Card
      className="overflow-hidden hover-elevate cursor-pointer"
      onClick={onClick}
      data-testid={`card-recipe-${recipe.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-sm truncate" data-testid={`text-recipe-name-${recipe.id}`}>
              {recipe.name}
            </h3>
            {recipe.cuisine && (
              <Badge variant="secondary" className="mt-1 text-[10px]">
                {recipe.cuisine}
              </Badge>
            )}
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            data-testid={`button-favorite-${recipe.id}`}
          >
            <Heart
              className={`h-4 w-4 ${
                recipe.isFavorite ? "fill-pink-500 text-pink-500" : "text-muted-foreground"
              }`}
            />
          </Button>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
          {totalTime > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {totalTime}min
            </span>
          )}
          {recipe.familyRating && (
            <StarRating rating={recipe.familyRating} readonly size="small" />
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1"
          onClick={(e) => {
            e.stopPropagation();
            onCook();
          }}
          data-testid={`button-cook-${recipe.id}`}
        >
          <ChefHat className="h-3 w-3" />
          Cook
        </Button>
      </CardContent>
    </Card>
  );
}

function RecipeDetailDialog({
  open,
  onOpenChange,
  recipe,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe: SavedRecipe | null;
}) {
  if (!recipe) return null;

  let ingredients: string[] = [];
  let instructions: string[] = [];
  
  try {
    ingredients = JSON.parse(recipe.ingredients);
  } catch {
    ingredients = recipe.ingredients.split("\n").filter(Boolean);
  }
  
  try {
    instructions = JSON.parse(recipe.instructions);
  } catch {
    instructions = recipe.instructions.split("\n").filter(Boolean);
  }

  const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-primary" />
            {recipe.name}
          </DialogTitle>
          <DialogDescription>
            {recipe.description || `${recipe.cuisine || "Homemade"} ${recipe.mealType || "dish"}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {recipe.cuisine && <Badge variant="secondary">{recipe.cuisine}</Badge>}
          {totalTime > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {totalTime} min
            </span>
          )}
          {recipe.servings && (
            <span>{recipe.servings} servings</span>
          )}
          {recipe.familyRating && (
            <StarRating rating={recipe.familyRating} readonly />
          )}
        </div>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-4">
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" />
                Ingredients
              </h4>
              <ul className="space-y-1.5">
                {ingredients.map((ingredient, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    {ingredient}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-2">Instructions</h4>
              <ol className="space-y-2">
                {instructions.map((step, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function LogMealDialog({
  open,
  onOpenChange,
  recipeName,
  recipeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipeName?: string;
  recipeId?: string;
}) {
  const { toast } = useToast();

  const form = useForm<LogMealFormValues>({
    resolver: zodResolver(logMealFormSchema),
    defaultValues: {
      name: recipeName || "",
      mealType: "dinner",
      cuisine: "",
      rating: undefined,
      notes: "",
    },
  });

  const logMealMutation = useMutation({
    mutationFn: async (data: LogMealFormValues) => {
      const response = await apiRequest("POST", "/api/meals", {
        ...data,
        recipeId: recipeId || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meals"] });
      form.reset();
      onOpenChange(false);
      toast({ title: "Meal logged", description: "Added to meal history" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to log meal", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log Meal</DialogTitle>
          <DialogDescription>Record what you cooked or ate</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => logMealMutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Meal Name</FormLabel>
                  <FormControl>
                    <Input placeholder="What did you make?" {...field} data-testid="input-meal-name" />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="mealType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Meal Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-meal-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MEAL_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rating"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rating</FormLabel>
                  <FormControl>
                    <div className="pt-1">
                      <StarRating
                        rating={field.value || null}
                        onChange={(r) => field.onChange(r)}
                      />
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full"
              disabled={logMealMutation.isPending}
              data-testid="button-submit-log-meal"
            >
              Log Meal
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function RecipeSuggestionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Get Recipe Suggestions
          </DialogTitle>
          <DialogDescription>Let ZEKE help you find the perfect recipe</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            ZEKE can suggest recipes based on your family's preferences, dietary restrictions, and what ingredients you have on hand.
          </p>
          
          <div className="bg-accent/10 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium">Try asking ZEKE:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• "Suggest a dinner recipe for tonight"</li>
              <li>• "What can I make with chicken and broccoli?"</li>
              <li>• "Give me a quick breakfast idea"</li>
              <li>• "Suggest something Italian that everyone will like"</li>
            </ul>
          </div>

          <Button
            className="w-full gap-2"
            onClick={() => {
              onOpenChange(false);
              window.location.href = "/chat";
            }}
            data-testid="button-go-to-chat"
          >
            <Sparkles className="h-4 w-4" />
            Ask ZEKE for Suggestions
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MealHistoryItem({
  meal,
  onUpdateRating,
}: {
  meal: MealHistory;
  onUpdateRating: (rating: number) => void;
}) {
  const mealDate = new Date(meal.cookedAt);

  return (
    <div
      className="flex items-center gap-3 px-3 py-3 rounded-lg border border-border hover-elevate"
      data-testid={`meal-history-${meal.id}`}
    >
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Calendar className="h-4 w-4 text-primary" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium" data-testid={`text-meal-name-${meal.id}`}>
            {meal.name}
          </span>
          <Badge variant="outline" className="text-[10px]">
            {meal.mealType}
          </Badge>
          {meal.cuisine && (
            <Badge variant="secondary" className="text-[10px]">
              {meal.cuisine}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {format(mealDate, "MMM d, yyyy 'at' h:mm a")}
        </p>
      </div>
      
      <div className="shrink-0">
        <StarRating
          rating={meal.rating}
          onChange={onUpdateRating}
          size="small"
        />
      </div>
    </div>
  );
}

function MealStats({ meals }: { meals: MealHistory[] }) {
  const thisMonth = startOfMonth(new Date());
  const mealsThisMonth = meals.filter(m => isAfter(new Date(m.cookedAt), thisMonth));
  
  const mealCounts: Record<string, number> = {};
  meals.forEach(m => {
    mealCounts[m.name] = (mealCounts[m.name] || 0) + 1;
  });
  
  const mostMade = Object.entries(mealCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="grid grid-cols-2 gap-3">
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-primary">{mealsThisMonth.length}</p>
          <p className="text-xs text-muted-foreground">Meals this month</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-sm font-medium truncate">{mostMade?.[0] || "—"}</p>
          <p className="text-xs text-muted-foreground">
            {mostMade ? `Made ${mostMade[1]} times` : "Most made dish"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function PreferencesSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[1, 2].map(i => (
        <Skeleton key={i} className="h-48 rounded-lg" />
      ))}
    </div>
  );
}

function RecipesSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <Skeleton key={i} className="h-32 rounded-lg" />
      ))}
    </div>
  );
}

function MealHistorySkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map(i => (
        <Skeleton key={i} className="h-16 rounded-lg" />
      ))}
    </div>
  );
}

export default function MealsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("preferences");
  const [searchQuery, setSearchQuery] = useState("");
  const [cuisineFilter, setCuisineFilter] = useState<string>("all");
  const [mealTypeFilter, setMealTypeFilter] = useState<string>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [preferenceDialogOpen, setPreferenceDialogOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>();
  const [selectedRecipe, setSelectedRecipe] = useState<SavedRecipe | null>(null);
  const [recipeDetailOpen, setRecipeDetailOpen] = useState(false);
  const [logMealOpen, setLogMealOpen] = useState(false);
  const [logMealRecipe, setLogMealRecipe] = useState<{ name?: string; id?: string }>({});
  const [suggestionDialogOpen, setSuggestionDialogOpen] = useState(false);

  const { data: familyMembers = [], isLoading: loadingMembers } = useQuery<FamilyMember[]>({
    queryKey: ["/api/food/family"],
  });

  const { data: preferences = [], isLoading: loadingPreferences } = useQuery<FoodPreference[]>({
    queryKey: ["/api/food/preferences"],
  });

  const { data: restrictions = [], isLoading: loadingRestrictions } = useQuery<DietaryRestriction[]>({
    queryKey: ["/api/food/restrictions"],
  });

  const { data: recipes = [], isLoading: loadingRecipes } = useQuery<SavedRecipe[]>({
    queryKey: ["/api/recipes", { query: searchQuery, favoritesOnly }],
  });

  const { data: meals = [], isLoading: loadingMeals } = useQuery<MealHistory[]>({
    queryKey: ["/api/meals"],
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (recipeId: string) => {
      const response = await apiRequest("POST", `/api/recipes/${recipeId}/favorite`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update favorite", description: error.message, variant: "destructive" });
    },
  });

  const updateRatingMutation = useMutation({
    mutationFn: async ({ mealId, rating }: { mealId: string; rating: number }) => {
      const response = await apiRequest("POST", `/api/meals/${mealId}/rating`, { rating });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meals"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update rating", description: error.message, variant: "destructive" });
    },
  });

  const cuisines = [...new Set(recipes.map(r => r.cuisine).filter(Boolean))];
  
  const filteredRecipes = recipes.filter(recipe => {
    if (cuisineFilter !== "all" && recipe.cuisine !== cuisineFilter) return false;
    if (mealTypeFilter !== "all" && recipe.mealType !== mealTypeFilter) return false;
    if (favoritesOnly && !recipe.isFavorite) return false;
    if (searchQuery && !recipe.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleAddPreference = (memberId?: string) => {
    setSelectedMemberId(memberId);
    setPreferenceDialogOpen(true);
  };

  const handleCookRecipe = (recipe: SavedRecipe) => {
    setLogMealRecipe({ name: recipe.name, id: recipe.id });
    setLogMealOpen(true);
  };

  const handleViewRecipe = (recipe: SavedRecipe) => {
    setSelectedRecipe(recipe);
    setRecipeDetailOpen(true);
  };

  return (
    <div className="flex flex-col h-screen h-[100dvh] bg-background" data-testid="meals-page">
      <header className="h-11 sm:h-14 border-b border-border flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Utensils className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          <h1 className="text-base sm:text-lg md:text-xl font-semibold" data-testid="text-page-title">
            Meals & Recipes
          </h1>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="border-b border-border px-3 sm:px-4 md:px-6">
            <TabsList className="h-10">
              <TabsTrigger value="preferences" className="gap-1" data-testid="tab-preferences">
                <Heart className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Preferences</span>
              </TabsTrigger>
              <TabsTrigger value="recipes" className="gap-1" data-testid="tab-recipes">
                <ChefHat className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Recipes</span>
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1" data-testid="tab-history">
                <Calendar className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Meal History</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1">
            <TabsContent value="preferences" className="p-3 sm:p-4 md:p-6 m-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium">Family Preferences</h2>
                <Button
                  size="sm"
                  className="gap-1"
                  onClick={() => handleAddPreference()}
                  data-testid="button-add-preference"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Preference
                </Button>
              </div>

              {loadingMembers || loadingPreferences || loadingRestrictions ? (
                <PreferencesSkeleton />
              ) : familyMembers.length === 0 ? (
                <div className="text-center py-12">
                  <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No family members found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {familyMembers.map(member => (
                    <PreferenceCard
                      key={member.id}
                      member={member}
                      preferences={preferences}
                      restrictions={restrictions}
                      onAddPreference={() => handleAddPreference(member.id)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="recipes" className="p-3 sm:p-4 md:p-6 m-0">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search recipes..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-recipes"
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Select value={cuisineFilter} onValueChange={setCuisineFilter}>
                      <SelectTrigger className="w-32" data-testid="select-cuisine-filter">
                        <SelectValue placeholder="Cuisine" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Cuisines</SelectItem>
                        {cuisines.map(c => (
                          <SelectItem key={c} value={c!}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={mealTypeFilter} onValueChange={setMealTypeFilter}>
                      <SelectTrigger className="w-32" data-testid="select-mealtype-filter">
                        <SelectValue placeholder="Meal Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {MEAL_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant={favoritesOnly ? "default" : "outline"}
                      size="icon"
                      onClick={() => setFavoritesOnly(!favoritesOnly)}
                      data-testid="button-favorites-filter"
                    >
                      <Heart className={`h-4 w-4 ${favoritesOnly ? "fill-current" : ""}`} />
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-1"
                      onClick={() => setSuggestionDialogOpen(true)}
                      data-testid="button-get-suggestion"
                    >
                      <Sparkles className="h-4 w-4" />
                      <span className="hidden sm:inline">Get Suggestion</span>
                    </Button>
                  </div>
                </div>

                {loadingRecipes ? (
                  <RecipesSkeleton />
                ) : filteredRecipes.length === 0 ? (
                  <div className="text-center py-12">
                    <ChefHat className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground mb-2">
                      {recipes.length === 0 ? "No recipes saved yet" : "No recipes match your filters"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Ask ZEKE to suggest recipes and save them here
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredRecipes.map(recipe => (
                      <RecipeCard
                        key={recipe.id}
                        recipe={recipe}
                        onToggleFavorite={() => toggleFavoriteMutation.mutate(recipe.id)}
                        onCook={() => handleCookRecipe(recipe)}
                        onClick={() => handleViewRecipe(recipe)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="history" className="p-3 sm:p-4 md:p-6 m-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium">Meal History</h2>
                  <Button
                    size="sm"
                    className="gap-1"
                    onClick={() => {
                      setLogMealRecipe({});
                      setLogMealOpen(true);
                    }}
                    data-testid="button-log-meal"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Log Meal
                  </Button>
                </div>

                {loadingMeals ? (
                  <>
                    <Skeleton className="h-20 rounded-lg" />
                    <MealHistorySkeleton />
                  </>
                ) : meals.length === 0 ? (
                  <div className="text-center py-12">
                    <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground mb-2">No meals logged yet</p>
                    <p className="text-sm text-muted-foreground">
                      Start tracking your meals to see stats and trends
                    </p>
                  </div>
                ) : (
                  <>
                    <MealStats meals={meals} />
                    <div className="space-y-2">
                      {meals.map(meal => (
                        <MealHistoryItem
                          key={meal.id}
                          meal={meal}
                          onUpdateRating={(rating) =>
                            updateRatingMutation.mutate({ mealId: meal.id, rating })
                          }
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </div>

      <AddPreferenceDialog
        open={preferenceDialogOpen}
        onOpenChange={setPreferenceDialogOpen}
        familyMembers={familyMembers}
        selectedMemberId={selectedMemberId}
      />

      <RecipeDetailDialog
        open={recipeDetailOpen}
        onOpenChange={setRecipeDetailOpen}
        recipe={selectedRecipe}
      />

      <LogMealDialog
        open={logMealOpen}
        onOpenChange={setLogMealOpen}
        recipeName={logMealRecipe.name}
        recipeId={logMealRecipe.id}
      />

      <RecipeSuggestionDialog
        open={suggestionDialogOpen}
        onOpenChange={setSuggestionDialogOpen}
      />
    </div>
  );
}
