import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  MapPin,
  Star,
  Plus,
  Trash2,
  Navigation,
  Settings,
  Bell,
  List,
  X,
  ChevronRight,
  ChevronLeft,
  Home,
  Briefcase,
  ShoppingCart,
  Coffee,
  Heart,
  MapPinned,
  RefreshCw,
  Eye,
  EyeOff,
  History,
  Pencil,
  Check
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface LocationHistory {
  id: string;
  latitude: string;
  longitude: string;
  accuracy?: string;
  altitude?: string;
  speed?: string;
  heading?: string;
  source: string;
  recordedAt: string;
}

interface SavedPlace {
  id: string;
  name: string;
  latitude: string;
  longitude: string;
  label?: string;
  address?: string;
  category: string;
  notes?: string;
  isStarred: boolean;
  proximityAlertEnabled: boolean;
  proximityRadiusMeters: number;
  createdAt: string;
}

interface PlaceList {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  linkedToGrocery: boolean;
  createdAt: string;
  places?: SavedPlace[];
}

interface LocationSettings {
  trackingEnabled: boolean;
  trackingIntervalMinutes: number;
  proximityAlertsEnabled: boolean;
  defaultProximityRadiusMeters: number;
  retentionDays: number;
}

const PLACE_CATEGORIES = [
  { value: "home", label: "Home", icon: Home },
  { value: "work", label: "Work", icon: Briefcase },
  { value: "grocery", label: "Grocery", icon: ShoppingCart },
  { value: "restaurant", label: "Restaurant", icon: Coffee },
  { value: "healthcare", label: "Healthcare", icon: Heart },
  { value: "other", label: "Other", icon: MapPinned },
] as const;

function getCategoryIcon(category: string) {
  const cat = PLACE_CATEGORIES.find(c => c.value === category);
  if (cat) {
    const Icon = cat.icon;
    return <Icon className="h-4 w-4" />;
  }
  return <MapPinned className="h-4 w-4" />;
}

function getCategoryColor(category: string): string {
  switch (category) {
    case "home": return "#22c55e";
    case "work": return "#3b82f6";
    case "grocery": return "#f97316";
    case "restaurant": return "#ec4899";
    case "healthcare": return "#ef4444";
    default: return "#8b5cf6";
  }
}

const createCustomIcon = (category: string, isStarred: boolean = false) => {
  const color = getCategoryColor(category);
  const starIndicator = isStarred ? '<span style="position:absolute;top:-3px;right:-3px;font-size:10px;">★</span>' : '';
  
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="position:relative;background:${color};width:28px;height:28px;border-radius:50%;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
      ${starIndicator}
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  });
};

const currentLocationIcon = L.divIcon({
  className: 'current-location-marker',
  html: `<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 2px #3b82f6,0 2px 8px rgba(0,0,0,0.3);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  
  useEffect(() => {
    if (center[0] !== 0 && center[1] !== 0) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  
  return null;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

function AddPlaceDialog({
  open,
  onOpenChange,
  initialLocation,
  onSave,
  isPending
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLocation: { lat: number; lng: number } | null;
  onSave: (data: any) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [category, setCategory] = useState("other");
  const [notes, setNotes] = useState("");
  const [isStarred, setIsStarred] = useState(false);
  const [proximityAlertEnabled, setProximityAlertEnabled] = useState(false);
  const [proximityRadius, setProximityRadius] = useState("200");

  useEffect(() => {
    if (!open) {
      setName("");
      setLabel("");
      setAddress("");
      setCategory("other");
      setNotes("");
      setIsStarred(false);
      setProximityAlertEnabled(false);
      setProximityRadius("200");
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !initialLocation) return;
    
    onSave({
      name: name.trim(),
      latitude: initialLocation.lat,
      longitude: initialLocation.lng,
      label: label.trim() || undefined,
      address: address.trim() || undefined,
      category,
      notes: notes.trim() || undefined,
      isStarred,
      proximityAlertEnabled,
      proximityRadiusMeters: parseInt(proximityRadius)
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-add-place">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Save Place
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Stop & Shop - Main St"
              disabled={isPending}
              data-testid="input-place-name"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory} disabled={isPending}>
                <SelectTrigger data-testid="select-place-category">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {PLACE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      <div className="flex items-center gap-2">
                        <cat.icon className="h-4 w-4" />
                        {cat.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., Favorite"
                disabled={isPending}
                data-testid="input-place-label"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street address (optional)"
              disabled={isPending}
              data-testid="input-place-address"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              className="resize-none"
              rows={2}
              disabled={isPending}
              data-testid="input-place-notes"
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Star className={`h-4 w-4 ${isStarred ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"}`} />
              <Label htmlFor="starred" className="text-sm cursor-pointer">Starred place</Label>
            </div>
            <Switch
              id="starred"
              checked={isStarred}
              onCheckedChange={setIsStarred}
              disabled={isPending}
              data-testid="switch-place-starred"
            />
          </div>

          <div className="space-y-3 border-t pt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="proximity" className="text-sm cursor-pointer">Proximity alerts</Label>
              </div>
              <Switch
                id="proximity"
                checked={proximityAlertEnabled}
                onCheckedChange={setProximityAlertEnabled}
                disabled={isPending}
                data-testid="switch-place-proximity"
              />
            </div>
            
            {proximityAlertEnabled && (
              <div className="space-y-2">
                <Label htmlFor="radius" className="text-sm text-muted-foreground">Alert radius (meters)</Label>
                <Input
                  id="radius"
                  type="number"
                  value={proximityRadius}
                  onChange={(e) => setProximityRadius(e.target.value)}
                  min="50"
                  max="5000"
                  disabled={isPending}
                  data-testid="input-place-radius"
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              data-testid="button-cancel-place"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !name.trim()}
              data-testid="button-save-place"
            >
              {isPending ? "Saving..." : "Save Place"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PlaceCard({ 
  place, 
  onDelete, 
  onToggleStar, 
  onView,
  isDeleting 
}: { 
  place: SavedPlace; 
  onDelete: () => void;
  onToggleStar: () => void;
  onView: () => void;
  isDeleting: boolean;
}) {
  return (
    <div
      className="group flex items-center gap-3 p-3 rounded-lg border border-border hover-elevate cursor-pointer"
      onClick={onView}
      data-testid={`place-card-${place.id}`}
    >
      <div 
        className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: getCategoryColor(place.category) + "20" }}
      >
        {getCategoryIcon(place.category)}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{place.name}</span>
          {place.isStarred && (
            <Star className="h-3 w-3 fill-yellow-500 text-yellow-500 shrink-0" />
          )}
        </div>
        {place.address && (
          <p className="text-xs text-muted-foreground truncate">{place.address}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="secondary" className="text-[10px]">
            {PLACE_CATEGORIES.find(c => c.value === place.category)?.label || "Other"}
          </Badge>
          {place.proximityAlertEnabled && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Bell className="h-2.5 w-2.5" />
              {place.proximityRadiusMeters}m
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <Button
          size="icon"
          variant="ghost"
          onClick={onToggleStar}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          data-testid={`button-star-place-${place.id}`}
        >
          <Star className={`h-4 w-4 ${place.isStarred ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"}`} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onDelete}
          disabled={isDeleting}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          data-testid={`button-delete-place-${place.id}`}
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

function SettingsSheet({ 
  settings, 
  onUpdate, 
  isUpdating 
}: { 
  settings: LocationSettings | null;
  onUpdate: (data: Partial<LocationSettings>) => void;
  isUpdating: boolean;
}) {
  const [localSettings, setLocalSettings] = useState<LocationSettings>({
    trackingEnabled: false,
    trackingIntervalMinutes: 15,
    proximityAlertsEnabled: true,
    defaultProximityRadiusMeters: 200,
    retentionDays: 30
  });

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  const handleToggle = (key: keyof LocationSettings, value: boolean) => {
    const updated = { ...localSettings, [key]: value };
    setLocalSettings(updated);
    onUpdate({ [key]: value });
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="icon" variant="outline" data-testid="button-location-settings">
          <Settings className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md" data-testid="sheet-location-settings">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Location Settings
          </SheetTitle>
        </SheetHeader>
        
        <div className="space-y-6 mt-6">
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <p className="font-medium text-sm">Location Tracking</p>
              <p className="text-xs text-muted-foreground">Track your location periodically</p>
            </div>
            <Switch
              checked={localSettings.trackingEnabled}
              onCheckedChange={(v) => handleToggle("trackingEnabled", v)}
              disabled={isUpdating}
              data-testid="switch-tracking-enabled"
            />
          </div>

          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <p className="font-medium text-sm">Proximity Alerts</p>
              <p className="text-xs text-muted-foreground">Get notified when near saved places</p>
            </div>
            <Switch
              checked={localSettings.proximityAlertsEnabled}
              onCheckedChange={(v) => handleToggle("proximityAlertsEnabled", v)}
              disabled={isUpdating}
              data-testid="switch-proximity-enabled"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Tracking Interval</Label>
            <Select
              value={String(localSettings.trackingIntervalMinutes)}
              onValueChange={(v) => {
                const updated = { ...localSettings, trackingIntervalMinutes: parseInt(v) };
                setLocalSettings(updated);
                onUpdate({ trackingIntervalMinutes: parseInt(v) });
              }}
              disabled={isUpdating || !localSettings.trackingEnabled}
            >
              <SelectTrigger data-testid="select-tracking-interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Every 5 minutes</SelectItem>
                <SelectItem value="15">Every 15 minutes</SelectItem>
                <SelectItem value="30">Every 30 minutes</SelectItem>
                <SelectItem value="60">Every hour</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Default Alert Radius</Label>
            <Select
              value={String(localSettings.defaultProximityRadiusMeters)}
              onValueChange={(v) => {
                const updated = { ...localSettings, defaultProximityRadiusMeters: parseInt(v) };
                setLocalSettings(updated);
                onUpdate({ defaultProximityRadiusMeters: parseInt(v) });
              }}
              disabled={isUpdating}
            >
              <SelectTrigger data-testid="select-default-radius">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="100">100 meters</SelectItem>
                <SelectItem value="200">200 meters</SelectItem>
                <SelectItem value="500">500 meters</SelectItem>
                <SelectItem value="1000">1 kilometer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">History Retention</Label>
            <Select
              value={String(localSettings.retentionDays)}
              onValueChange={(v) => {
                const updated = { ...localSettings, retentionDays: parseInt(v) };
                setLocalSettings(updated);
                onUpdate({ retentionDays: parseInt(v) });
              }}
              disabled={isUpdating}
            >
              <SelectTrigger data-testid="select-retention-days">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CreateListDialog({
  open,
  onOpenChange,
  onSave,
  isPending
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { name: string; description?: string; linkedToGrocery: boolean }) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [linkedToGrocery, setLinkedToGrocery] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setLinkedToGrocery(false);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      linkedToGrocery
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-create-list">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <List className="h-5 w-5 text-primary" />
            Create Place List
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="list-name">Name *</Label>
            <Input
              id="list-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Grocery Stores, Coffee Shops"
              disabled={isPending}
              data-testid="input-list-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="list-description">Description</Label>
            <Textarea
              id="list-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description for this list..."
              className="resize-none"
              rows={2}
              disabled={isPending}
              data-testid="input-list-description"
            />
          </div>

          <div className="flex items-center justify-between py-2 border-t">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="linked-grocery" className="text-sm cursor-pointer">Link to grocery</Label>
                <p className="text-xs text-muted-foreground">
                  Alert when near these stores if groceries are due
                </p>
              </div>
            </div>
            <Switch
              id="linked-grocery"
              checked={linkedToGrocery}
              onCheckedChange={setLinkedToGrocery}
              disabled={isPending}
              data-testid="switch-linked-grocery"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              data-testid="button-cancel-list"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !name.trim()}
              data-testid="button-save-list"
            >
              {isPending ? "Creating..." : "Create List"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function LocationPage() {
  const { toast } = useToast();
  const [mapCenter, setMapCenter] = useState<[number, number]>([42.3601, -71.0589]);
  const [mapZoom, setMapZoom] = useState(13);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isAddingPlace, setIsAddingPlace] = useState(false);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedTab, setSelectedTab] = useState("places");
  const [isLocating, setIsLocating] = useState(false);

  const { data: places, isLoading: placesLoading } = useQuery<SavedPlace[]>({
    queryKey: ["/api/location/places"],
  });

  const { data: locationHistory } = useQuery<LocationHistory[]>({
    queryKey: ["/api/location/history"],
    enabled: showHistory,
  });

  const { data: settings } = useQuery<LocationSettings>({
    queryKey: ["/api/location/settings"],
  });

  const { data: lists, isLoading: listsLoading } = useQuery<PlaceList[]>({
    queryKey: ["/api/location/lists"],
  });

  const addPlaceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/location/places", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location/places"] });
      setIsAddingPlace(false);
      setSelectedLocation(null);
      toast({ title: "Place saved", description: "Location added to your saved places" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save place", description: error.message, variant: "destructive" });
    },
  });

  const deletePlaceMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/location/places/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location/places"] });
      toast({ title: "Place removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove place", description: error.message, variant: "destructive" });
    },
  });

  const toggleStarMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/location/places/${id}/star`);
      return response.json();
    },
    onSuccess: (data: SavedPlace) => {
      queryClient.invalidateQueries({ queryKey: ["/api/location/places"] });
      toast({ title: data.isStarred ? "Place starred" : "Star removed" });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<LocationSettings>) => {
      const response = await apiRequest("PATCH", "/api/location/settings", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location/settings"] });
    },
  });

  const recordLocationMutation = useMutation({
    mutationFn: async (data: { latitude: number; longitude: number; accuracy?: number }) => {
      const response = await apiRequest("POST", "/api/location/history", {
        ...data,
        source: "gps"
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location/history"] });
    },
  });

  const createListMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; linkedToGrocery: boolean }) => {
      const response = await apiRequest("POST", "/api/location/lists", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location/lists"] });
      setIsCreatingList(false);
      toast({ title: "List created", description: "New place list has been created" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create list", description: error.message, variant: "destructive" });
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/location/lists/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location/lists"] });
      toast({ title: "List removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove list", description: error.message, variant: "destructive" });
    },
  });

  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation not supported", variant: "destructive" });
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setCurrentLocation({ lat: latitude, lng: longitude });
        setMapCenter([latitude, longitude]);
        setMapZoom(15);
        setIsLocating(false);
        
        if (settings?.trackingEnabled) {
          recordLocationMutation.mutate({ latitude, longitude, accuracy });
        }
      },
      (error) => {
        setIsLocating(false);
        toast({ 
          title: "Location error", 
          description: error.message,
          variant: "destructive" 
        });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [settings?.trackingEnabled, toast]);

  const handleMapClick = (lat: number, lng: number) => {
    setSelectedLocation({ lat, lng });
    setIsAddingPlace(true);
  };

  const viewPlace = (place: SavedPlace) => {
    const lat = parseFloat(place.latitude);
    const lng = parseFloat(place.longitude);
    setMapCenter([lat, lng]);
    setMapZoom(16);
  };

  const historyTrail = locationHistory?.map(loc => [
    parseFloat(loc.latitude),
    parseFloat(loc.longitude)
  ] as [number, number]) || [];

  const starredPlaces = places?.filter(p => p.isStarred) || [];
  const regularPlaces = places?.filter(p => !p.isStarred) || [];

  return (
    <div className="flex flex-col h-screen h-[100dvh] bg-background" data-testid="location-page">
      <header className="h-11 sm:h-14 border-b border-border flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          <h1 className="text-base sm:text-lg md:text-xl font-semibold" data-testid="text-page-title">
            Locations
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            onClick={() => setShowHistory(!showHistory)}
            data-testid="button-toggle-history"
          >
            {showHistory ? <EyeOff className="h-4 w-4" /> : <History className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={getCurrentLocation}
            disabled={isLocating}
            data-testid="button-get-location"
          >
            {isLocating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Navigation className="h-4 w-4" />
            )}
          </Button>
          <SettingsSheet 
            settings={settings || null} 
            onUpdate={(data) => updateSettingsMutation.mutate(data)}
            isUpdating={updateSettingsMutation.isPending}
          />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            className="h-full w-full z-0"
            style={{ background: "#1a1a1a" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapController center={mapCenter} zoom={mapZoom} />
            <MapClickHandler onMapClick={handleMapClick} />
            
            {currentLocation && (
              <Marker 
                position={[currentLocation.lat, currentLocation.lng]} 
                icon={currentLocationIcon}
              >
                <Popup>
                  <div className="text-sm font-medium">Your Location</div>
                </Popup>
              </Marker>
            )}

            {showHistory && historyTrail.length > 1 && (
              <Polyline
                positions={historyTrail}
                color="#3b82f6"
                weight={3}
                opacity={0.6}
                dashArray="5, 10"
              />
            )}

            {places?.map((place) => (
              <Marker
                key={place.id}
                position={[parseFloat(place.latitude), parseFloat(place.longitude)]}
                icon={createCustomIcon(place.category, place.isStarred)}
              >
                <Popup>
                  <div className="min-w-[150px]">
                    <div className="font-medium text-sm flex items-center gap-1">
                      {place.name}
                      {place.isStarred && <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />}
                    </div>
                    {place.address && (
                      <div className="text-xs text-muted-foreground mt-1">{place.address}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {PLACE_CATEGORIES.find(c => c.value === place.category)?.label || "Other"}
                    </div>
                    {place.notes && (
                      <div className="text-xs mt-2 border-t pt-2">{place.notes}</div>
                    )}
                  </div>
                </Popup>
                {place.proximityAlertEnabled && (
                  <Circle
                    center={[parseFloat(place.latitude), parseFloat(place.longitude)]}
                    radius={place.proximityRadiusMeters}
                    color={getCategoryColor(place.category)}
                    fillColor={getCategoryColor(place.category)}
                    fillOpacity={0.1}
                    weight={1}
                  />
                )}
              </Marker>
            ))}
          </MapContainer>

          <div className="absolute bottom-4 left-4 z-[1000]">
            <Button
              onClick={() => {
                if (currentLocation) {
                  setSelectedLocation(currentLocation);
                  setIsAddingPlace(true);
                } else {
                  toast({ 
                    title: "Get your location first",
                    description: "Click the navigation button to find your current location"
                  });
                }
              }}
              className="gap-2 shadow-lg"
              data-testid="button-add-current-location"
            >
              <Plus className="h-4 w-4" />
              Save Current Location
            </Button>
          </div>
        </div>

        <div className="w-80 lg:w-96 border-l border-border bg-background hidden md:flex flex-col">
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex-1 flex flex-col">
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-4 h-11">
              <TabsTrigger value="places" className="gap-1.5" data-testid="tab-places">
                <MapPin className="h-3.5 w-3.5" />
                Places
              </TabsTrigger>
              <TabsTrigger value="lists" className="gap-1.5" data-testid="tab-lists">
                <List className="h-3.5 w-3.5" />
                Lists
              </TabsTrigger>
            </TabsList>

            <TabsContent value="places" className="flex-1 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-4">
                  {placesLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-20 rounded-lg" />
                      ))}
                    </div>
                  ) : places?.length === 0 ? (
                    <div className="text-center py-8">
                      <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm font-medium">No saved places</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Click on the map to save a location
                      </p>
                    </div>
                  ) : (
                    <>
                      {starredPlaces.length > 0 && (
                        <div>
                          <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <Star className="h-3 w-3" />
                            Starred
                          </h3>
                          <div className="space-y-2">
                            {starredPlaces.map((place) => (
                              <PlaceCard
                                key={place.id}
                                place={place}
                                onDelete={() => deletePlaceMutation.mutate(place.id)}
                                onToggleStar={() => toggleStarMutation.mutate(place.id)}
                                onView={() => viewPlace(place)}
                                isDeleting={deletePlaceMutation.isPending}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {regularPlaces.length > 0 && (
                        <div>
                          <h3 className="text-xs font-medium text-muted-foreground mb-2">
                            All Places ({regularPlaces.length})
                          </h3>
                          <div className="space-y-2">
                            {regularPlaces.map((place) => (
                              <PlaceCard
                                key={place.id}
                                place={place}
                                onDelete={() => deletePlaceMutation.mutate(place.id)}
                                onToggleStar={() => toggleStarMutation.mutate(place.id)}
                                onView={() => viewPlace(place)}
                                isDeleting={deletePlaceMutation.isPending}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="lists" className="flex-1 m-0 overflow-hidden flex flex-col">
              <div className="p-4 pb-2 shrink-0">
                <Button
                  onClick={() => setIsCreatingList(true)}
                  className="w-full gap-2"
                  data-testid="button-create-list"
                >
                  <Plus className="h-4 w-4" />
                  Create New List
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4 pt-2 space-y-4">
                  {listsLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 rounded-lg" />
                      ))}
                    </div>
                  ) : lists?.length === 0 ? (
                    <div className="text-center py-8">
                      <List className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm font-medium">No place lists</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Create lists to group similar places
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {lists?.map((list) => (
                        <div
                          key={list.id}
                          className="group flex items-center gap-3 p-3 rounded-lg border border-border hover-elevate cursor-pointer"
                          data-testid={`list-card-${list.id}`}
                        >
                          <div className="shrink-0 w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                            <List className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">{list.name}</span>
                              {list.linkedToGrocery && (
                                <Badge variant="outline" className="text-[10px] gap-1">
                                  <ShoppingCart className="h-2.5 w-2.5" />
                                  Grocery
                                </Badge>
                              )}
                            </div>
                            {list.description && (
                              <p className="text-xs text-muted-foreground truncate">{list.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => deleteListMutation.mutate(list.id)}
                              disabled={deleteListMutation.isPending}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                              data-testid={`button-delete-list-${list.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <AddPlaceDialog
        open={isAddingPlace}
        onOpenChange={(open) => {
          setIsAddingPlace(open);
          if (!open) setSelectedLocation(null);
        }}
        initialLocation={selectedLocation}
        onSave={(data) => addPlaceMutation.mutate(data)}
        isPending={addPlaceMutation.isPending}
      />

      <CreateListDialog
        open={isCreatingList}
        onOpenChange={setIsCreatingList}
        onSave={(data) => createListMutation.mutate(data)}
        isPending={createListMutation.isPending}
      />
    </div>
  );
}
