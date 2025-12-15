import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { parse, isValid } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { format, subHours, startOfDay, endOfDay } from "date-fns";
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
  Check,
  Search,
  Loader2,
  CalendarDays,
  Crosshair,
  Move
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
  DialogDescription,
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
  createdAt: string;
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

interface ProximityAlert {
  id: string;
  savedPlaceId: string;
  placeListId?: string | null;
  distanceMeters: string;
  alertType: "grocery" | "reminder" | "general";
  alertMessage: string;
  acknowledged: boolean;
  createdAt: string;
}

interface GeocodingResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
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
  html: `<div style="position:relative;width:32px;height:32px;">
    <div style="position:absolute;inset:0;border-radius:50%;border:2px solid rgba(59, 130, 246, 0.3);"></div>
    <div style="position:absolute;inset:6px;border-radius:50%;border:2px solid rgba(59, 130, 246, 0.5);"></div>
    <div style="position:absolute;inset:12px;border-radius:50%;background:#3b82f6;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
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
  initialAddress,
  onSave,
  isPending
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLocation: { lat: number; lng: number } | null;
  initialAddress?: string | null;
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
    if (open && initialAddress) {
      setAddress(initialAddress);
      const nameParts = initialAddress.split(",").slice(0, 2);
      if (nameParts.length > 0) {
        setName(nameParts.join(",").trim());
      }
    }
  }, [open, initialAddress]);

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
          <DialogDescription>Save a location to your places list</DialogDescription>
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

function EditPlaceDialog({
  open,
  onOpenChange,
  place,
  onSave,
  isPending
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  place: SavedPlace | null;
  onSave: (id: string, data: any) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [category, setCategory] = useState("other");
  const [notes, setNotes] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [proximityAlertEnabled, setProximityAlertEnabled] = useState(false);
  const [proximityRadius, setProximityRadius] = useState("200");

  useEffect(() => {
    if (open && place) {
      setName(place.name);
      setLabel(place.label || "");
      setAddress(place.address || "");
      setCategory(place.category);
      setNotes(place.notes || "");
      setLatitude(place.latitude);
      setLongitude(place.longitude);
      setProximityAlertEnabled(place.proximityAlertEnabled);
      setProximityRadius(String(place.proximityRadiusMeters));
    }
  }, [open, place]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !place) return;
    
    onSave(place.id, {
      name: name.trim(),
      latitude,
      longitude,
      label: label.trim() || null,
      address: address.trim() || null,
      category,
      notes: notes.trim() || null,
      proximityAlertEnabled,
      proximityRadiusMeters: parseInt(proximityRadius)
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-edit-place">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Edit Place
          </DialogTitle>
          <DialogDescription>Update location details and coordinates</DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name *</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
              data-testid="input-edit-name"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-category">Category</Label>
              <Select value={category} onValueChange={setCategory} disabled={isPending}>
                <SelectTrigger data-testid="select-edit-category">
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
              <Label htmlFor="edit-label">Label</Label>
              <Input
                id="edit-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                disabled={isPending}
                data-testid="input-edit-label"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Crosshair className="h-4 w-4 text-muted-foreground" />
              GPS Coordinates
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-lat" className="text-xs text-muted-foreground">Latitude</Label>
                <Input
                  id="edit-lat"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="42.123456"
                  disabled={isPending}
                  data-testid="input-edit-latitude"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-lng" className="text-xs text-muted-foreground">Longitude</Label>
                <Input
                  id="edit-lng"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="-71.123456"
                  disabled={isPending}
                  data-testid="input-edit-longitude"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-address">Address</Label>
            <Input
              id="edit-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={isPending}
              data-testid="input-edit-address"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none"
              rows={2}
              disabled={isPending}
              data-testid="input-edit-notes"
            />
          </div>

          <div className="space-y-3 border-t pt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="edit-proximity" className="text-sm cursor-pointer">Proximity alerts</Label>
              </div>
              <Switch
                id="edit-proximity"
                checked={proximityAlertEnabled}
                onCheckedChange={setProximityAlertEnabled}
                disabled={isPending}
                data-testid="switch-edit-proximity"
              />
            </div>
            
            {proximityAlertEnabled && (
              <div className="space-y-2">
                <Label htmlFor="edit-radius" className="text-sm text-muted-foreground">Alert radius (meters)</Label>
                <Input
                  id="edit-radius"
                  type="number"
                  value={proximityRadius}
                  onChange={(e) => setProximityRadius(e.target.value)}
                  min="50"
                  max="5000"
                  disabled={isPending}
                  data-testid="input-edit-radius"
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
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !name.trim()}
              data-testid="button-save-edit"
            >
              {isPending ? "Saving..." : "Save Changes"}
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
  onEdit,
  isDeleting 
}: { 
  place: SavedPlace; 
  onDelete: () => void;
  onToggleStar: () => void;
  onView: () => void;
  onEdit: () => void;
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
          onClick={onEdit}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          data-testid={`button-edit-place-${place.id}`}
        >
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </Button>
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
                <SelectItem value="0">Forever</SelectItem>
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
          <DialogDescription>Create a new list to organize your saved places</DialogDescription>
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

function AddressSearch({
  onSelectAddress,
  onClose
}: {
  onSelectAddress: (lat: number, lng: number, address: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const searchAddress = async (searchQuery: string) => {
    if (searchQuery.length < 3) {
      setResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&addressdetails=1`,
        {
          headers: {
            "Accept": "application/json",
            "User-Agent": "ZEKEAssistant/1.0"
          }
        }
      );
      const data: GeocodingResult[] = await response.json();
      setResults(data);
      setShowResults(true);
    } catch (error) {
      console.error("Geocoding error:", error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchAddress(value);
    }, 300);
  };

  const handleSelectResult = (result: GeocodingResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    onSelectAddress(lat, lng, result.display_name);
    setShowResults(false);
    setQuery("");
  };

  const formatAddress = (result: GeocodingResult): string => {
    if (result.address) {
      const parts = [];
      if (result.address.house_number && result.address.road) {
        parts.push(`${result.address.house_number} ${result.address.road}`);
      } else if (result.address.road) {
        parts.push(result.address.road);
      }
      const city = result.address.city || result.address.town;
      if (city) parts.push(city);
      if (result.address.state) parts.push(result.address.state);
      if (parts.length > 0) return parts.join(", ");
    }
    const displayParts = result.display_name.split(",").slice(0, 3);
    return displayParts.join(",").trim();
  };

  return (
    <div className="flex items-center gap-2 flex-1 max-w-md relative">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={handleInputChange}
          placeholder="Enter address to save..."
          className="pl-9 pr-8 h-9"
          data-testid="input-address-search"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={onClose}
        data-testid="button-close-search"
      >
        <X className="h-4 w-4" />
      </Button>

      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-10 mt-1 bg-background border border-border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
          {results.map((result) => (
            <button
              key={result.place_id}
              className="w-full text-left px-3 py-2.5 hover-elevate flex items-start gap-2 border-b border-border last:border-0"
              onClick={() => handleSelectResult(result)}
              data-testid={`result-${result.place_id}`}
            >
              <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{formatAddress(result)}</p>
                <p className="text-xs text-muted-foreground truncate">{result.display_name}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {showResults && results.length === 0 && query.length >= 3 && !isSearching && (
        <div className="absolute top-full left-0 right-10 mt-1 bg-background border border-border rounded-md shadow-lg z-50 p-4 text-center">
          <p className="text-sm text-muted-foreground">No results found</p>
        </div>
      )}
    </div>
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
  const [showAddressSearch, setShowAddressSearch] = useState(false);
  const [searchedAddress, setSearchedAddress] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [editingPlace, setEditingPlace] = useState<SavedPlace | null>(null);

  const searchString = useSearch();

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const dateParam = params.get('date');
    if (dateParam) {
      const parsedDate = parse(dateParam, 'yyyy-MM-dd', new Date());
      if (isValid(parsedDate)) {
        setSelectedDate(parsedDate);
        setShowHistory(true);
      }
    }
  }, [searchString]);

  const { startDate, endDate } = useMemo(() => {
    if (selectedDate) {
      return {
        startDate: startOfDay(selectedDate).toISOString(),
        endDate: endOfDay(selectedDate).toISOString()
      };
    }
    const now = new Date();
    return {
      startDate: subHours(now, 24).toISOString(),
      endDate: now.toISOString()
    };
  }, [selectedDate]);

  const { data: places, isLoading: placesLoading } = useQuery<SavedPlace[]>({
    queryKey: ["/api/location/places"],
  });

  const { data: proximityAlerts, isLoading: alertsLoading } = useQuery<ProximityAlert[]>({
    queryKey: ["/api/location/alerts"],
  });

  const { data: locationHistory } = useQuery<LocationHistory[]>({
    queryKey: ["/api/location/history", startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate,
        endDate
      });
      const response = await fetch(`/api/location/history?${params}`);
      if (!response.ok) throw new Error("Failed to fetch location history");
      return response.json();
    },
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

  const updatePlaceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/location/places/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location/places"] });
      setEditingPlace(null);
      toast({ title: "Place updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update place", description: error.message, variant: "destructive" });
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

  const acknowledgeAlertMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/location/alerts/${id}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location/alerts"] });
      toast({ title: "Alert acknowledged" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to acknowledge alert", description: error.message, variant: "destructive" });
    },
  });

  const acknowledgeAllAlertsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/location/alerts/acknowledge-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location/alerts"] });
      toast({ title: "All alerts acknowledged" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to acknowledge alerts", description: error.message, variant: "destructive" });
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

  const handleAddressSelect = (lat: number, lng: number, address: string) => {
    setSelectedLocation({ lat, lng });
    setSearchedAddress(address);
    setMapCenter([lat, lng]);
    setMapZoom(16);
    setShowAddressSearch(false);
    setIsAddingPlace(true);
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
        {showAddressSearch ? (
          <AddressSearch
            onSelectAddress={handleAddressSelect}
            onClose={() => setShowAddressSearch(false)}
          />
        ) : (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <h1 className="text-base sm:text-lg md:text-xl font-semibold" data-testid="text-page-title">
              Locations
            </h1>
          </div>
        )}
        
        <div className="flex items-center gap-2">
          {!showAddressSearch && (
            <Button
              size="icon"
              variant="outline"
              onClick={() => setShowAddressSearch(true)}
              data-testid="button-open-search"
            >
              <Search className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="outline"
            onClick={() => setShowHistory(!showHistory)}
            data-testid="button-toggle-history"
          >
            {showHistory ? <EyeOff className="h-4 w-4" /> : <History className="h-4 w-4" />}
          </Button>
          {showHistory && (
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  className="gap-2 text-xs sm:text-sm"
                  data-testid="button-date-picker"
                >
                  <CalendarDays className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {selectedDate ? format(selectedDate, "MMM d, yyyy") : "Last 24 hours"}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="p-3 border-b border-border">
                  <Button
                    variant={selectedDate === null ? "default" : "ghost"}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      setSelectedDate(null);
                      setDatePickerOpen(false);
                    }}
                    data-testid="button-last-24-hours"
                  >
                    Last 24 hours
                  </Button>
                </div>
                <Calendar
                  mode="single"
                  selected={selectedDate ?? undefined}
                  onSelect={(date) => {
                    setSelectedDate(date ?? null);
                    setDatePickerOpen(false);
                  }}
                  disabled={(date) => date > new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          )}
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
          <Button
            size="icon"
            variant={showPanel ? "default" : "outline"}
            onClick={() => setShowPanel(!showPanel)}
            data-testid="button-toggle-panel"
          >
            {showPanel ? <ChevronRight className="h-4 w-4" /> : <List className="h-4 w-4" />}
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
              maxZoom={19}
              keepBuffer={4}
              updateWhenZooming={false}
              updateWhenIdle={true}
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

            {showHistory && locationHistory?.map((location, index) => {
              const totalPoints = locationHistory.length;
              const normalizedIndex = index / Math.max(totalPoints - 1, 1);
              const opacity = 0.3 + (normalizedIndex * 0.7);
              const radius = 4 + (normalizedIndex * 4);

              // Color-code by source: Overland = green, GPS = blue, Network = purple, Manual = orange
              const sourceColors = {
                overland: { fill: '#22c55e', stroke: '#16a34a' },
                gps: { fill: '#3b82f6', stroke: '#1d4ed8' },
                network: { fill: '#a855f7', stroke: '#7c3aed' },
                manual: { fill: '#f97316', stroke: '#ea580c' }
              };
              const colors = sourceColors[location.source as keyof typeof sourceColors] || sourceColors.gps;

              return (
                <CircleMarker
                  key={location.id}
                  center={[parseFloat(location.latitude), parseFloat(location.longitude)]}
                  radius={radius}
                  fillColor={colors.fill}
                  fillOpacity={opacity}
                  color={colors.stroke}
                  weight={1}
                  opacity={opacity}
                >
                  <Popup>
                    <div className="text-sm">
                      <div className="font-medium">Location Point</div>
                      <div className="text-muted-foreground text-xs mt-1">
                        {format(new Date(location.createdAt), "MMM d, yyyy 'at' h:mm a")}
                      </div>
                      {location.accuracy && (
                        <div className="text-muted-foreground text-xs mt-0.5">
                          Accuracy: {parseFloat(location.accuracy).toFixed(0)}m
                        </div>
                      )}
                      <div className="text-muted-foreground text-xs mt-0.5">
                        Source: <span className="font-medium">{location.source === 'overland' ? 'Overland GPS' : location.source.toUpperCase()}</span>
                      </div>
                      {location.speed && (
                        <div className="text-muted-foreground text-xs mt-0.5">
                          Speed: {parseFloat(location.speed).toFixed(1)} m/s
                        </div>
                      )}
                      {location.altitude && (
                        <div className="text-muted-foreground text-xs mt-0.5">
                          Altitude: {parseFloat(location.altitude).toFixed(0)}m
                        </div>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

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

          {currentLocation && (
            <div className="absolute top-4 left-4 z-[1000] bg-background/95 backdrop-blur border border-border rounded-lg p-3 shadow-lg" data-testid="current-location-card">
              <div className="flex items-center gap-2 mb-2">
                <div className="relative w-5 h-5">
                  <div className="absolute inset-0 rounded-full border border-blue-400/40"></div>
                  <div className="absolute inset-1 rounded-full border border-blue-400/60"></div>
                  <div className="absolute inset-[6px] rounded-full bg-blue-500 border border-white"></div>
                </div>
                <span className="text-sm font-medium">Your Location</span>
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <div>Lat: {currentLocation.lat.toFixed(6)}</div>
                <div>Lng: {currentLocation.lng.toFixed(6)}</div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="w-full mt-2 text-xs"
                onClick={() => {
                  setMapCenter([currentLocation.lat, currentLocation.lng]);
                  setMapZoom(16);
                }}
                data-testid="button-center-on-me"
              >
                <Navigation className="h-3 w-3 mr-1" />
                Center on me
              </Button>
            </div>
          )}

          <div className="absolute bottom-4 left-4 z-[1000] flex flex-col gap-2">
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

            {showHistory && locationHistory && locationHistory.length > 0 && (
              <div className="bg-background/95 backdrop-blur border border-border rounded-lg p-2 shadow-lg text-xs">
                <div className="font-medium mb-1.5">Location Sources:</div>
                <div className="space-y-1">
                  {locationHistory.some(l => l.source === 'overland') && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500 border border-green-600"></div>
                      <span>Overland GPS</span>
                    </div>
                  )}
                  {locationHistory.some(l => l.source === 'gps') && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500 border border-blue-700"></div>
                      <span>Browser GPS</span>
                    </div>
                  )}
                  {locationHistory.some(l => l.source === 'network') && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-purple-500 border border-purple-700"></div>
                      <span>Network</span>
                    </div>
                  )}
                  {locationHistory.some(l => l.source === 'manual') && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-orange-500 border border-orange-600"></div>
                      <span>Manual</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={`w-80 lg:w-96 border-l border-border bg-background flex-col ${showPanel ? 'flex' : 'hidden'}`}>
          {starredPlaces.length > 0 && (
            <div className="px-4 py-3 border-b border-border bg-accent/30">
              <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                Quick Access
              </h3>
              <div className="flex flex-wrap gap-2">
                {starredPlaces.slice(0, 4).map((place) => (
                  <Button
                    key={place.id}
                    size="sm"
                    variant="secondary"
                    className="gap-1.5 text-xs"
                    onClick={() => viewPlace(place)}
                    data-testid={`quick-place-${place.id}`}
                  >
                    {getCategoryIcon(place.category)}
                    <span className="truncate max-w-[80px]">{place.name}</span>
                  </Button>
                ))}
                {starredPlaces.length > 4 && (
                  <Badge variant="outline" className="text-[10px]">
                    +{starredPlaces.length - 4} more
                  </Badge>
                )}
              </div>
            </div>
          )}
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
              <TabsTrigger value="alerts" className="gap-1.5" data-testid="tab-alerts">
                <Bell className="h-3.5 w-3.5" />
                Alerts
                {proximityAlerts?.filter(a => !a.acknowledged).length ? (
                  <Badge variant="destructive" className="ml-1.5 h-4 px-1 text-[10px]">
                    {proximityAlerts.filter(a => !a.acknowledged).length}
                  </Badge>
                ) : null}
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
                                onEdit={() => setEditingPlace(place)}
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
                                onEdit={() => setEditingPlace(place)}
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

            <TabsContent value="alerts" className="flex-1 m-0 overflow-hidden flex flex-col">
              <div className="p-4 pb-2 shrink-0">
                {proximityAlerts?.filter(a => !a.acknowledged).length ? (
                  <Button
                    onClick={() => acknowledgeAllAlertsMutation.mutate()}
                    variant="outline"
                    className="w-full gap-2"
                    disabled={acknowledgeAllAlertsMutation.isPending}
                    data-testid="button-acknowledge-all"
                  >
                    <Check className="h-4 w-4" />
                    Acknowledge All ({proximityAlerts.filter(a => !a.acknowledged).length})
                  </Button>
                ) : null}
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4 pt-2 space-y-3">
                  {alertsLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-24 rounded-lg" />
                      ))}
                    </div>
                  ) : !proximityAlerts || proximityAlerts.length === 0 ? (
                    <div className="text-center py-8">
                      <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm font-medium">No proximity alerts</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Alerts will appear when you approach saved places
                      </p>
                    </div>
                  ) : (
                    <>
                      {proximityAlerts.filter(a => !a.acknowledged).length > 0 && (
                        <div className="space-y-2">
                          <h3 className="text-xs font-medium text-muted-foreground px-1">Unacknowledged</h3>
                          {proximityAlerts
                            .filter(a => !a.acknowledged)
                            .map((alert) => {
                              const place = places?.find(p => p.id === alert.savedPlaceId);
                              const distanceKm = parseFloat(alert.distanceMeters) / 1000;
                              const distanceText = distanceKm < 1
                                ? `${Math.round(parseFloat(alert.distanceMeters))}m`
                                : `${distanceKm.toFixed(1)}km`;

                              return (
                                <div
                                  key={alert.id}
                                  className="group p-3 rounded-lg border border-border bg-accent/50 hover-elevate"
                                  data-testid={`alert-card-${alert.id}`}
                                >
                                  <div className="flex items-start gap-3">
                                    <div className="shrink-0 w-8 h-8 rounded-full bg-background flex items-center justify-center">
                                      <Bell className="h-3.5 w-3.5 text-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-1">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium">{place?.name || 'Unknown Place'}</p>
                                          <p className="text-xs text-muted-foreground mt-0.5">{distanceText} away</p>
                                        </div>
                                        <Badge variant={
                                          alert.alertType === 'grocery' ? 'default' :
                                          alert.alertType === 'reminder' ? 'secondary' :
                                          'outline'
                                        } className="text-[10px]">
                                          {alert.alertType}
                                        </Badge>
                                      </div>
                                      <p className="text-xs text-foreground/80 leading-relaxed">{alert.alertMessage}</p>
                                      <div className="flex items-center justify-between pt-1">
                                        <span className="text-[10px] text-muted-foreground">
                                          {format(new Date(alert.createdAt), 'MMM d, h:mm a')}
                                        </span>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => acknowledgeAlertMutation.mutate(alert.id)}
                                          disabled={acknowledgeAlertMutation.isPending}
                                          className="h-6 text-xs gap-1"
                                          data-testid={`button-acknowledge-${alert.id}`}
                                        >
                                          <Check className="h-3 w-3" />
                                          Acknowledge
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}

                      {proximityAlerts.filter(a => a.acknowledged).length > 0 && (
                        <div className="space-y-2">
                          <h3 className="text-xs font-medium text-muted-foreground px-1">Recent</h3>
                          {proximityAlerts
                            .filter(a => a.acknowledged)
                            .map((alert) => {
                              const place = places?.find(p => p.id === alert.savedPlaceId);
                              const distanceKm = parseFloat(alert.distanceMeters) / 1000;
                              const distanceText = distanceKm < 1
                                ? `${Math.round(parseFloat(alert.distanceMeters))}m`
                                : `${distanceKm.toFixed(1)}km`;

                              return (
                                <div
                                  key={alert.id}
                                  className="p-3 rounded-lg border border-border opacity-60"
                                  data-testid={`alert-card-acknowledged-${alert.id}`}
                                >
                                  <div className="flex items-start gap-3">
                                    <div className="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                      <Check className="h-3.5 w-3.5 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-1">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium">{place?.name || 'Unknown Place'}</p>
                                          <p className="text-xs text-muted-foreground mt-0.5">{distanceText} away</p>
                                        </div>
                                        <Badge variant="outline" className="text-[10px]">
                                          {alert.alertType}
                                        </Badge>
                                      </div>
                                      <p className="text-xs text-muted-foreground leading-relaxed">{alert.alertMessage}</p>
                                      <span className="text-[10px] text-muted-foreground">
                                        {format(new Date(alert.createdAt), 'MMM d, h:mm a')}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </>
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
          if (!open) {
            setSelectedLocation(null);
            setSearchedAddress(null);
          }
        }}
        initialLocation={selectedLocation}
        initialAddress={searchedAddress}
        onSave={(data) => addPlaceMutation.mutate(data)}
        isPending={addPlaceMutation.isPending}
      />

      <CreateListDialog
        open={isCreatingList}
        onOpenChange={setIsCreatingList}
        onSave={(data) => createListMutation.mutate(data)}
        isPending={createListMutation.isPending}
      />

      <EditPlaceDialog
        open={editingPlace !== null}
        onOpenChange={(open) => { if (!open) setEditingPlace(null); }}
        place={editingPlace}
        onSave={(id, data) => updatePlaceMutation.mutate({ id, data })}
        isPending={updatePlaceMutation.isPending}
      />
    </div>
  );
}
