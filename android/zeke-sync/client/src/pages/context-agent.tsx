import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  Brain, 
  Power, 
  RefreshCw, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Play,
  MessageSquare,
  Loader2,
  Ban,
  Trash2
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface ContextAgentSettings {
  id: string;
  enabled: boolean;
  scanIntervalMinutes: number;
  lookbackHours: number;
  autoExecute: boolean;
  requireApprovalForSms: boolean;
  notifyOnExecution: boolean;
  lastScanAt: string | null;
  updatedAt: string;
}

interface WakeWordCommand {
  id: string;
  lifelogId: string;
  lifelogTitle: string;
  wakeWord: string;
  rawCommand: string;
  speakerName: string | null;
  timestamp: string;
  context: string | null;
  actionType: string | null;
  actionDetails: string | null;
  targetContactId: string | null;
  status: "detected" | "parsed" | "pending_approval" | "executing" | "completed" | "failed" | "skipped";
  executionResult: string | null;
  confidence: string | null;
  createdAt: string;
  executedAt: string | null;
}

interface ContextAgentStatus {
  running: boolean;
  settings: ContextAgentSettings | null;
  isProcessing: boolean;
  recentCommands: WakeWordCommand[];
  pendingCommands: WakeWordCommand[];
}

interface ScanResult {
  scanned: number;
  detected: number;
  parsed: number;
  executed: number;
  failed: number;
  skipped: number;
  errors: string[];
}

export default function ContextAgentPage() {
  const { toast } = useToast();

  const { data: status, isLoading } = useQuery<ContextAgentStatus>({
    queryKey: ["/api/context-agent/status"],
    refetchInterval: 10000,
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("POST", "/api/context-agent/toggle", { enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/context-agent/status"] });
      toast({
        title: "Context Agent Updated",
        description: status?.running ? "Agent disabled" : "Agent enabled",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const scanMutation = useMutation({
    mutationFn: async (hours?: number) => {
      const res = await apiRequest("POST", "/api/context-agent/scan", { hours });
      return res.json() as Promise<ScanResult>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/context-agent/status"] });
      toast({
        title: "Scan Complete",
        description: `Scanned ${result.scanned} lifelogs, detected ${result.detected}, executed ${result.executed}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Scan Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<ContextAgentSettings>) => {
      const res = await apiRequest("PATCH", "/api/context-agent/settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/context-agent/status"] });
      toast({ title: "Settings Updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/context-agent/commands/${id}/approve`, {});
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/context-agent/status"] });
      toast({
        title: result.success ? "Command Executed" : "Execution Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/context-agent/commands/${id}/reject`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/context-agent/status"] });
      toast({ title: "Command Rejected" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/context-agent/commands/${id}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/context-agent/status"] });
      toast({ title: "Command Deleted" });
    },
  });

  function getStatusBadge(cmdStatus: string) {
    switch (cmdStatus) {
      case "completed":
        return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case "pending_approval":
        return <Badge className="bg-yellow-600"><AlertCircle className="h-3 w-3 mr-1" />Pending</Badge>;
      case "executing":
        return <Badge className="bg-blue-600"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Executing</Badge>;
      case "skipped":
        return <Badge variant="secondary"><Ban className="h-3 w-3 mr-1" />Skipped</Badge>;
      case "parsed":
        return <Badge className="bg-purple-600"><Brain className="h-3 w-3 mr-1" />Parsed</Badge>;
      default:
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Detected</Badge>;
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const settings = status?.settings;
  const recentCommands = status?.recentCommands || [];
  const pendingCommands = status?.pendingCommands || [];

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">ZEKE Context Agent</h1>
          <p className="text-muted-foreground">
            Wake word detection and autonomous command execution
          </p>
        </div>
        <div className="flex items-center gap-3">
          {status?.isProcessing && (
            <Badge className="bg-blue-600">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Processing
            </Badge>
          )}
          <Badge variant={status?.running ? "default" : "secondary"} data-testid="badge-agent-status">
            <Power className="h-3 w-3 mr-1" />
            {status?.running ? "Running" : "Stopped"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Agent Control
            </CardTitle>
            <CardDescription>
              Configure how ZEKE listens for and executes voice commands
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable Agent</Label>
                <p className="text-sm text-muted-foreground">
                  Scan lifelogs for "Hey ZEKE" commands
                </p>
              </div>
              <Switch
                checked={settings?.enabled ?? false}
                onCheckedChange={(enabled) => toggleMutation.mutate(enabled)}
                disabled={toggleMutation.isPending}
                data-testid="switch-agent-enabled"
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto-Execute Commands</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically execute detected commands
                </p>
              </div>
              <Switch
                checked={settings?.autoExecute ?? false}
                onCheckedChange={(autoExecute) => updateSettingsMutation.mutate({ autoExecute })}
                disabled={updateSettingsMutation.isPending}
                data-testid="switch-auto-execute"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Require SMS Approval</Label>
                <p className="text-sm text-muted-foreground">
                  SMS messages require manual approval
                </p>
              </div>
              <Switch
                checked={settings?.requireApprovalForSms ?? false}
                onCheckedChange={(requireApprovalForSms) => updateSettingsMutation.mutate({ requireApprovalForSms })}
                disabled={updateSettingsMutation.isPending}
                data-testid="switch-require-sms-approval"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Notify on Execution</Label>
                <p className="text-sm text-muted-foreground">
                  Get SMS notification when commands are executed
                </p>
              </div>
              <Switch
                checked={settings?.notifyOnExecution ?? false}
                onCheckedChange={(notifyOnExecution) => updateSettingsMutation.mutate({ notifyOnExecution })}
                disabled={updateSettingsMutation.isPending}
                data-testid="switch-notify-execution"
              />
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <Button
                onClick={() => scanMutation.mutate(undefined)}
                disabled={scanMutation.isPending || status?.isProcessing}
                data-testid="button-run-scan"
              >
                {scanMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Run Scan Now
              </Button>
              <Button
                variant="outline"
                onClick={() => scanMutation.mutate(24)}
                disabled={scanMutation.isPending || status?.isProcessing}
                data-testid="button-run-scan-24h"
              >
                Scan Last 24 Hours
              </Button>
            </div>

            {settings?.lastScanAt && (
              <p className="text-sm text-muted-foreground">
                Last scan: {formatDistanceToNow(new Date(settings.lastScanAt), { addSuffix: true })}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Pending Approval
              {pendingCommands.length > 0 && (
                <Badge className="ml-2">{pendingCommands.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Commands waiting for manual approval
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingCommands.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No commands pending approval</p>
              </div>
            ) : (
              <ScrollArea className="h-[200px]">
                <div className="space-y-3">
                  {pendingCommands.map((cmd) => (
                    <div
                      key={cmd.id}
                      className="p-3 border rounded-lg space-y-2"
                      data-testid={`pending-command-${cmd.id}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">"{cmd.rawCommand}"</p>
                          <p className="text-sm text-muted-foreground">
                            From: {cmd.lifelogTitle}
                          </p>
                        </div>
                        {getStatusBadge(cmd.status)}
                      </div>
                      {cmd.actionType && (
                        <Badge variant="outline" className="text-xs">
                          {cmd.actionType.replace(/_/g, " ")}
                        </Badge>
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => approveMutation.mutate(cmd.id)}
                          disabled={approveMutation.isPending}
                          data-testid={`button-approve-${cmd.id}`}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Execute
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => rejectMutation.mutate(cmd.id)}
                          disabled={rejectMutation.isPending}
                          data-testid={`button-reject-${cmd.id}`}
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Command History
          </CardTitle>
          <CardDescription>
            Recent wake word detections and their execution status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentCommands.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No commands detected yet</p>
              <p className="text-sm mt-1">
                Say "Hey ZEKE" followed by a command to your Omi pendant
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {recentCommands.map((cmd) => (
                  <div
                    key={cmd.id}
                    className="p-4 border rounded-lg space-y-2"
                    data-testid={`command-${cmd.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">"{cmd.rawCommand}"</p>
                          {getStatusBadge(cmd.status)}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {cmd.lifelogTitle}
                          {cmd.speakerName && ` - ${cmd.speakerName}`}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(cmd.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-${cmd.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-wrap">
                      {cmd.actionType && (
                        <Badge variant="outline" className="text-xs">
                          {cmd.actionType.replace(/_/g, " ")}
                        </Badge>
                      )}
                      {cmd.confidence && (
                        <Badge variant="secondary" className="text-xs">
                          {(parseFloat(cmd.confidence) * 100).toFixed(0)}% confidence
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(cmd.createdAt), "MMM d, h:mm a")}
                      </span>
                    </div>

                    {cmd.executionResult && (
                      <p className="text-sm mt-2 p-2 bg-muted rounded">
                        {cmd.executionResult}
                      </p>
                    )}

                    {cmd.context && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          View context
                        </summary>
                        <p className="mt-2 p-2 bg-muted rounded text-xs">
                          {cmd.context}
                        </p>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
