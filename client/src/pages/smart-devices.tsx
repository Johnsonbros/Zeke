import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Power,
  PowerOff,
  RefreshCw,
  Zap,
  Plug,
  Activity,
  Settings,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface DeviceStatus {
  configured: boolean;
  message: string;
}

interface DeviceInfo {
  deviceIp: string;
  deviceName: string;
  isOn: boolean;
  model: string;
  onTime?: number;
  mac?: string;
}

interface EnergyUsage {
  deviceIp: string;
  currentPower: string;
  currentPowerWatts: string;
  todayRuntime: string;
  todayEnergy: string;
  monthRuntime: string;
  monthEnergy: string;
}

interface CloudDevice {
  deviceId: string;
  name: string;
  model: string;
  type: string;
  region: string;
  status: string;
}

export default function SmartDevicesPage() {
  const { toast } = useToast();
  const [deviceIp, setDeviceIp] = useState("192.168.1.199");
  const [currentDevice, setCurrentDevice] = useState<DeviceInfo | null>(null);
  const [energyData, setEnergyData] = useState<EnergyUsage | null>(null);

  const { data: statusData, isLoading: statusLoading } = useQuery<DeviceStatus>({
    queryKey: ["/api/smart-devices/status"],
  });

  const { data: cloudDevices, isLoading: discoverLoading, refetch: discoverDevices } = useQuery<{ success: boolean; devices: CloudDevice[]; deviceCount: number }>({
    queryKey: ["/api/smart-devices/discover"],
    enabled: false,
  });

  const getStatusMutation = useMutation({
    mutationFn: async (ip: string) => {
      const res = await fetch(`/api/smart-devices/${ip}/status`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setCurrentDevice(data);
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to get device status",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getEnergyMutation = useMutation({
    mutationFn: async (ip: string) => {
      const res = await fetch(`/api/smart-devices/${ip}/energy`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setEnergyData(data);
      } else {
        toast({
          title: "Energy Data Unavailable",
          description: data.error || "Could not get energy data",
          variant: "destructive",
        });
      }
    },
  });

  const powerMutation = useMutation({
    mutationFn: async ({ ip, action }: { ip: string; action: "on" | "off" | "toggle" }) => {
      const res = await apiRequest("POST", `/api/smart-devices/${ip}/power`, { action });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Success",
          description: data.message,
        });
        getStatusMutation.mutate(deviceIp);
        getEnergyMutation.mutate(deviceIp);
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to control device",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleRefreshStatus = () => {
    getStatusMutation.mutate(deviceIp);
    getEnergyMutation.mutate(deviceIp);
  };

  const isConfigured = statusData?.configured ?? false;

  return (
    <div className="container py-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Plug className="h-6 w-6 text-primary" />
            Smart Devices
          </h1>
          <p className="text-muted-foreground">
            Control your TP-Link Tapo smart plugs
          </p>
        </div>
        <Badge variant={isConfigured ? "default" : "destructive"} data-testid="status-configured">
          {isConfigured ? "Connected" : "Not Configured"}
        </Badge>
      </div>

      {!isConfigured && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Configuration Required
            </CardTitle>
            <CardDescription>
              Set TAPO_EMAIL and TAPO_PASSWORD in your secrets to connect to TP-Link cloud.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {isConfigured && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Device Control
              </CardTitle>
              <CardDescription>
                Enter the local IP address of your Tapo device
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1">
                  <Label htmlFor="deviceIp">Device IP Address</Label>
                  <Input
                    id="deviceIp"
                    value={deviceIp}
                    onChange={(e) => setDeviceIp(e.target.value)}
                    placeholder="192.168.1.199"
                    data-testid="input-device-ip"
                  />
                </div>
                <Button
                  className="w-full sm:w-auto"
                  onClick={handleRefreshStatus}
                  disabled={getStatusMutation.isPending || !deviceIp}
                  data-testid="button-refresh-status"
                >
                  {getStatusMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Get Status
                </Button>
              </div>

              {currentDevice && (
                <div className="mt-6 space-y-4">
                  <Separator />
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${currentDevice.isOn ? 'bg-green-500/20' : 'bg-muted'}`}>
                        {currentDevice.isOn ? (
                          <Power className="h-6 w-6 text-green-500" />
                        ) : (
                          <PowerOff className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold" data-testid="text-device-name">
                          {currentDevice.deviceName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {currentDevice.model} • {currentDevice.deviceIp}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={currentDevice.isOn ? "default" : "secondary"} data-testid="status-power">
                        {currentDevice.isOn ? "ON" : "OFF"}
                      </Badge>
                      {currentDevice.onTime && currentDevice.onTime > 0 && (
                        <Badge variant="outline" className="gap-1">
                          <Clock className="h-3 w-3" />
                          {Math.floor(currentDevice.onTime / 60)}m
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant={currentDevice.isOn ? "secondary" : "default"}
                      onClick={() => powerMutation.mutate({ ip: deviceIp, action: "on" })}
                      disabled={powerMutation.isPending}
                      data-testid="button-power-on"
                    >
                      <Power className="h-4 w-4 mr-2" />
                      Turn On
                    </Button>
                    <Button
                      variant={!currentDevice.isOn ? "secondary" : "destructive"}
                      onClick={() => powerMutation.mutate({ ip: deviceIp, action: "off" })}
                      disabled={powerMutation.isPending}
                      data-testid="button-power-off"
                    >
                      <PowerOff className="h-4 w-4 mr-2" />
                      Turn Off
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => powerMutation.mutate({ ip: deviceIp, action: "toggle" })}
                      disabled={powerMutation.isPending}
                      data-testid="button-power-toggle"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Toggle
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {energyData && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  Energy Usage
                </CardTitle>
                <CardDescription>
                  Power consumption statistics for {energyData.deviceIp}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Current Power</p>
                    <p className="text-xl font-semibold" data-testid="text-current-power">
                      {energyData.currentPowerWatts}
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Today's Energy</p>
                    <p className="text-xl font-semibold" data-testid="text-today-energy">
                      {energyData.todayEnergy}
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Today's Runtime</p>
                    <p className="text-xl font-semibold" data-testid="text-today-runtime">
                      {energyData.todayRuntime}
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Month Energy</p>
                    <p className="text-xl font-semibold" data-testid="text-month-energy">
                      {energyData.monthEnergy}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Cloud Devices
              </CardTitle>
              <CardDescription>
                Devices registered to your TP-Link account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                onClick={() => discoverDevices()}
                disabled={discoverLoading}
                data-testid="button-discover-devices"
              >
                {discoverLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Discover Devices
              </Button>

              {cloudDevices?.devices && cloudDevices.devices.length > 0 && (
                <div className="mt-4 space-y-2">
                  {cloudDevices.devices.map((device) => (
                    <div
                      key={device.deviceId}
                      className="flex flex-wrap items-center justify-between gap-2 p-3 border rounded-lg"
                      data-testid={`device-${device.deviceId}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Plug className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{device.name}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {device.model} • {device.region}
                          </p>
                        </div>
                      </div>
                      <Badge variant={device.status === "online" ? "default" : "secondary"}>
                        {device.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {cloudDevices?.devices && cloudDevices.devices.length === 0 && (
                <p className="mt-4 text-muted-foreground text-sm">
                  No devices found. Make sure your Tapo devices are registered in the TP-Link app.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Voice & Chat Commands</CardTitle>
              <CardDescription>
                You can control your smart devices by talking to ZEKE
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  "Turn on the plug" or "Turn off the smart plug"
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  "Is the plug on?" or "Check the plug status"
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  "How much power is the plug using?"
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  "Toggle the smart plug"
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
