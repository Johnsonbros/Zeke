import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Bluetooth,
  Battery,
  Wifi,
  WifiOff,
  Plus,
  Trash2,
  RefreshCw,
  Smartphone,
  Circle,
  Settings,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";

interface Device {
  id: string;
  type: "omi" | "limitless" | "custom";
  name: string;
  macAddress: string | null;
  firmwareVersion: string | null;
  hardwareModel: string | null;
  status: "paired" | "active" | "offline" | "disconnected";
  batteryLevel: number | null;
  lastSeen: string | null;
  pairedAt: string;
  metadata: string | null;
}

function DeviceCard({ device, onDelete }: { device: Device; onDelete: () => void }) {
  const statusColors: Record<string, string> = {
    active: "bg-green-500",
    paired: "bg-blue-500",
    offline: "bg-gray-500",
    disconnected: "bg-red-500",
  };

  const statusLabels: Record<string, string> = {
    active: "Active",
    paired: "Paired",
    offline: "Offline",
    disconnected: "Disconnected",
  };

  const typeLabels: Record<string, string> = {
    omi: "Omi Pendant",
    limitless: "Limitless Pendant",
    custom: "Custom Device",
  };

  const getBatteryIcon = (level: number | null) => {
    if (level === null) return null;
    if (level > 60) return <Battery className="h-4 w-4 text-green-500" />;
    if (level > 20) return <Battery className="h-4 w-4 text-yellow-500" />;
    return <Battery className="h-4 w-4 text-red-500" />;
  };

  return (
    <Card data-testid={`device-card-${device.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <Bluetooth className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">{device.name}</CardTitle>
              <CardDescription className="text-sm">
                {typeLabels[device.type] || device.type}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              <Circle className={`h-2 w-2 ${statusColors[device.status]}`} />
              {statusLabels[device.status]}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          {device.macAddress && (
            <div>
              <span className="text-muted-foreground">MAC Address</span>
              <p className="font-mono text-xs">{device.macAddress}</p>
            </div>
          )}
          {device.firmwareVersion && (
            <div>
              <span className="text-muted-foreground">Firmware</span>
              <p>{device.firmwareVersion}</p>
            </div>
          )}
          {device.batteryLevel !== null && (
            <div className="flex items-center gap-2">
              {getBatteryIcon(device.batteryLevel)}
              <span>{device.batteryLevel}%</span>
            </div>
          )}
          {device.lastSeen && (
            <div>
              <span className="text-muted-foreground">Last Seen</span>
              <p className="text-xs">{format(new Date(device.lastSeen), "MMM d, h:mm a")}</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground">
            Paired {format(new Date(device.pairedAt), "MMM d, yyyy")}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-destructive hover:text-destructive"
            data-testid={`button-delete-device-${device.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddDeviceDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"omi" | "limitless" | "custom">("omi");
  const [macAddress, setMacAddress] = useState("");
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (data: { type: string; name: string; macAddress?: string }) => {
      return apiRequest("/api/devices", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({ title: "Device added", description: "Your device has been registered." });
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      setOpen(false);
      setName("");
      setMacAddress("");
      onSuccess();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      type,
      name,
      macAddress: macAddress || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-device">
          <Plus className="h-4 w-4 mr-2" />
          Add Device
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Device</DialogTitle>
          <DialogDescription>
            Register a new Omi or Limitless pendant to connect with ZEKE.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="device-type">Device Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger data-testid="select-device-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="omi">Omi Pendant</SelectItem>
                <SelectItem value="limitless">Limitless Pendant</SelectItem>
                <SelectItem value="custom">Custom Device</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="device-name">Device Name</Label>
            <Input
              id="device-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Omi Pendant"
              required
              data-testid="input-device-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mac-address">MAC Address (optional)</Label>
            <Input
              id="mac-address"
              value={macAddress}
              onChange={(e) => setMacAddress(e.target.value)}
              placeholder="AA:BB:CC:DD:EE:FF"
              data-testid="input-mac-address"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-device">
              {createMutation.isPending ? "Adding..." : "Add Device"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function DevicesPage() {
  const { toast } = useToast();

  const { data: devices, isLoading, refetch } = useQuery<Device[]>({
    queryKey: ["/api/devices"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/devices/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast({ title: "Device removed", description: "The device has been unregistered." });
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const activeDevices = devices?.filter((d) => d.status === "active") || [];
  const offlineDevices = devices?.filter((d) => d.status !== "active") || [];

  return (
    <ScrollArea className="h-full">
      <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Devices</h1>
            <p className="text-muted-foreground">
              Manage your connected Omi and Limitless pendants
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              data-testid="button-refresh-devices"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <AddDeviceDialog onSuccess={() => {}} />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Pairing Instructions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <strong>Omi Pendant:</strong> Open the ZEKE companion app on your Android phone, 
              enable Bluetooth, and the app will automatically discover and connect to your Omi pendant.
              Audio streams directly via WebSocket.
            </div>
            <div>
              <strong>Limitless Pendant:</strong> Set your LIMITLESS_API_KEY in the environment 
              variables. ZEKE will sync lifelogs automatically from the Limitless cloud API.
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : devices && devices.length > 0 ? (
          <div className="space-y-6">
            {activeDevices.length > 0 && (
              <div>
                <h2 className="text-lg font-medium mb-3 flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-green-500" />
                  Active Devices ({activeDevices.length})
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {activeDevices.map((device) => (
                    <DeviceCard
                      key={device.id}
                      device={device}
                      onDelete={() => deleteMutation.mutate(device.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            {offlineDevices.length > 0 && (
              <div>
                <h2 className="text-lg font-medium mb-3 flex items-center gap-2">
                  <WifiOff className="h-4 w-4 text-muted-foreground" />
                  Offline Devices ({offlineDevices.length})
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {offlineDevices.map((device) => (
                    <DeviceCard
                      key={device.id}
                      device={device}
                      onDelete={() => deleteMutation.mutate(device.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Devices Registered</h3>
              <p className="text-muted-foreground mb-4">
                Add your first Omi or Limitless pendant to get started
              </p>
              <AddDeviceDialog onSuccess={() => {}} />
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}
