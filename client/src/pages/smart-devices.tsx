import { useState, useEffect } from "react";
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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
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
  DollarSign,
  TrendingUp,
  MousePointer,
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
  ip?: string;
}

interface EnergyHistoryPoint {
  time: string;
  power: number;
  energy: number;
}

const DEFAULT_ELECTRICITY_RATE = 0.12;

export default function SmartDevicesPage() {
  const { toast } = useToast();
  const [deviceIp, setDeviceIp] = useState("192.168.1.199");
  const [currentDevice, setCurrentDevice] = useState<DeviceInfo | null>(null);
  const [energyData, setEnergyData] = useState<EnergyUsage | null>(null);
  const [energyHistory, setEnergyHistory] = useState<EnergyHistoryPoint[]>([]);
  const [electricityRate, setElectricityRate] = useState(() => {
    const saved = localStorage.getItem("electricityRate");
    return saved ? parseFloat(saved) : DEFAULT_ELECTRICITY_RATE;
  });
  const [selectedCloudDevice, setSelectedCloudDevice] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("electricityRate", electricityRate.toString());
  }, [electricityRate]);

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
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const powerValue = parseFloat(data.currentPowerWatts.replace(/[^\d.]/g, "")) || 0;
        const energyValue = parseFloat(data.todayEnergy.replace(/[^\d.]/g, "")) || 0;
        
        setEnergyHistory((prev) => {
          const newPoint = { time: timeStr, power: powerValue, energy: energyValue };
          const updated = [...prev, newPoint];
          return updated.slice(-20);
        });
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

  const handleCloudDeviceClick = (device: CloudDevice) => {
    setSelectedCloudDevice(device.deviceId);
    setEnergyHistory([]);
    setCurrentDevice(null);
    setEnergyData(null);
    if (device.ip) {
      setDeviceIp(device.ip);
      toast({
        title: "Device Selected",
        description: `IP address set to ${device.ip}. Click "Get Status" to connect.`,
      });
    } else {
      toast({
        title: "Device Selected",
        description: `"${device.name}" selected. Enter the device's local IP address to control it.`,
      });
    }
  };

  const calculateCostEstimate = () => {
    if (!energyData) return null;
    
    const todayKwh = parseFloat(energyData.todayEnergy.replace(/[^\d.]/g, "")) || 0;
    const monthKwh = parseFloat(energyData.monthEnergy.replace(/[^\d.]/g, "")) || 0;
    
    const todayCost = todayKwh * electricityRate;
    const monthCost = monthKwh * electricityRate;
    const projectedMonthlyCost = (todayKwh * 30) * electricityRate;
    
    return {
      todayCost: todayCost.toFixed(2),
      monthCost: monthCost.toFixed(2),
      projectedMonthlyCost: projectedMonthlyCost.toFixed(2),
      todayKwh: todayKwh.toFixed(2),
      monthKwh: monthKwh.toFixed(2),
    };
  };

  const costEstimate = calculateCostEstimate();
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
                <Activity className="h-5 w-5" />
                Cloud Devices
              </CardTitle>
              <CardDescription>
                Click a device to select it, then enter its local IP address
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
                      onClick={() => handleCloudDeviceClick(device)}
                      className={`flex flex-wrap items-center justify-between gap-2 p-3 border rounded-lg cursor-pointer transition-colors hover-elevate ${
                        selectedCloudDevice === device.deviceId
                          ? "border-primary bg-primary/5"
                          : ""
                      }`}
                      data-testid={`device-${device.deviceId}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Plug className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate flex items-center gap-2">
                            {device.name}
                            {selectedCloudDevice === device.deviceId && (
                              <MousePointer className="h-3 w-3 text-primary" />
                            )}
                          </p>
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

              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="default"
                  onClick={() => powerMutation.mutate({ ip: deviceIp, action: "on" })}
                  disabled={powerMutation.isPending || !deviceIp}
                  data-testid="button-quick-on"
                >
                  {powerMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Power className="h-4 w-4 mr-2" />
                  )}
                  Turn On
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => powerMutation.mutate({ ip: deviceIp, action: "off" })}
                  disabled={powerMutation.isPending || !deviceIp}
                  data-testid="button-quick-off"
                >
                  {powerMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <PowerOff className="h-4 w-4 mr-2" />
                  )}
                  Turn Off
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
              <CardContent className="space-y-6">
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

                {energyHistory.length > 1 && (
                  <div className="space-y-4">
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Power Usage Over Time
                      </h4>
                      <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={energyHistory}>
                            <defs>
                              <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis 
                              dataKey="time" 
                              className="text-xs fill-muted-foreground"
                              tick={{ fontSize: 11 }}
                            />
                            <YAxis 
                              className="text-xs fill-muted-foreground"
                              tick={{ fontSize: 11 }}
                              tickFormatter={(value) => `${value}W`}
                            />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "6px",
                              }}
                              labelStyle={{ color: "hsl(var(--foreground))" }}
                              formatter={(value: number) => [`${value.toFixed(1)}W`, "Power"]}
                            />
                            <Area
                              type="monotone"
                              dataKey="power"
                              stroke="hsl(var(--primary))"
                              fill="url(#powerGradient)"
                              strokeWidth={2}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-500" />
                Cost Estimation
              </CardTitle>
              <CardDescription>
                Estimate your electricity costs based on usage
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1 max-w-xs">
                  <Label htmlFor="electricityRate">Electricity Rate ($/kWh)</Label>
                  <Input
                    id="electricityRate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={electricityRate}
                    onChange={(e) => setElectricityRate(parseFloat(e.target.value) || 0)}
                    placeholder="0.12"
                    data-testid="input-electricity-rate"
                  />
                </div>
                <p className="text-sm text-muted-foreground pb-2">
                  Average US rate: $0.12/kWh
                </p>
              </div>

              {costEstimate ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Today's Cost</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-today-cost">
                      ${costEstimate.todayCost}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {costEstimate.todayKwh} kWh used
                    </p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">This Month</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-month-cost">
                      ${costEstimate.monthCost}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {costEstimate.monthKwh} kWh used
                    </p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Projected Monthly</p>
                    <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400" data-testid="text-projected-cost">
                      ${costEstimate.projectedMonthlyCost}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Based on today's usage
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Connect to a device and get its status to see cost estimates.
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
