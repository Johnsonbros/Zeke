import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Check,
  Copy,
  X,
  Webhook,
  Key,
  Settings,
  Link2,
  AlertCircle,
  ExternalLink,
  MessageSquare,
  Brain,
  Mic,
  Calendar,
  Cloud,
  Phone,
} from "lucide-react";

interface IntegrationStatus {
  domain: string;
  webhooks: {
    name: string;
    path: string;
    method: string;
    description: string;
  }[];
  apiKeys: {
    name: string;
    envVar: string;
    configured: boolean;
    description: string;
    required: boolean;
  }[];
  services: {
    name: string;
    icon: string;
    status: "connected" | "disconnected" | "partial" | "not_configured";
    description: string;
    requiredKeys: string[];
  }[];
}

function WebhookCard({ 
  webhook, 
  domain 
}: { 
  webhook: IntegrationStatus["webhooks"][0]; 
  domain: string;
}) {
  const { toast } = useToast();
  const fullUrl = `https://${domain}${webhook.path}`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast({
        title: "Copied",
        description: "Webhook URL copied to clipboard",
      });
    } catch {
      toast({
        title: "Failed to copy",
        description: "Please copy the URL manually",
        variant: "destructive",
      });
    }
  };

  return (
    <Card data-testid={`webhook-card-${webhook.name.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{webhook.name}</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            {webhook.method}
          </Badge>
        </div>
        <CardDescription className="text-sm">
          {webhook.description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-muted p-2 rounded-md overflow-x-auto whitespace-nowrap">
            {fullUrl}
          </code>
          <Button 
            size="icon" 
            variant="outline" 
            onClick={copyToClipboard}
            data-testid={`button-copy-${webhook.name.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ApiKeyStatus({ apiKey }: { apiKey: IntegrationStatus["apiKeys"][0] }) {
  return (
    <div 
      className="flex items-center justify-between p-3 rounded-lg border"
      data-testid={`apikey-status-${apiKey.envVar.toLowerCase()}`}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${apiKey.configured ? "bg-green-500/10" : "bg-destructive/10"}`}>
          {apiKey.configured ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <X className="h-4 w-4 text-destructive" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium">{apiKey.name}</p>
          <p className="text-xs text-muted-foreground">{apiKey.envVar}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {apiKey.required && !apiKey.configured && (
          <Badge variant="destructive" className="text-xs">Required</Badge>
        )}
        <Badge variant={apiKey.configured ? "default" : "secondary"} className="text-xs">
          {apiKey.configured ? "Configured" : "Missing"}
        </Badge>
      </div>
    </div>
  );
}

function ServiceCard({ service }: { service: IntegrationStatus["services"][0] }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected": return "text-green-500 bg-green-500/10";
      case "disconnected": return "text-destructive bg-destructive/10";
      case "partial": return "text-yellow-500 bg-yellow-500/10";
      default: return "text-muted-foreground bg-muted";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "connected": return "Connected";
      case "disconnected": return "Disconnected";
      case "partial": return "Partial";
      default: return "Not Configured";
    }
  };

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case "openai": return Brain;
      case "twilio": return Phone;
      case "omi": return Mic;
      case "calendar": return Calendar;
      case "weather": return Cloud;
      default: return Link2;
    }
  };

  const Icon = getIcon(service.icon);

  return (
    <Card data-testid={`service-card-${service.name.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${getStatusColor(service.status)}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-medium">{service.name}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {service.description}
              </p>
            </div>
          </div>
          <Badge 
            variant={service.status === "connected" ? "default" : "secondary"}
            className="shrink-0"
          >
            {getStatusLabel(service.status)}
          </Badge>
        </div>
        {service.requiredKeys.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-1">Required keys:</p>
            <div className="flex flex-wrap gap-1">
              {service.requiredKeys.map((key) => (
                <Badge key={key} variant="outline" className="text-xs">
                  {key}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function IntegrationsPage() {
  const { toast } = useToast();

  const statusQuery = useQuery<IntegrationStatus>({
    queryKey: ["/api/integrations/status"],
  });

  const copyAllWebhooks = async () => {
    if (!statusQuery.data) return;
    const urls = statusQuery.data.webhooks
      .map(w => `${w.name}: https://${statusQuery.data.domain}${w.path}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(urls);
      toast({
        title: "Copied",
        description: "All webhook URLs copied to clipboard",
      });
    } catch {
      toast({
        title: "Failed to copy",
        variant: "destructive",
      });
    }
  };

  const configuredCount = statusQuery.data?.apiKeys.filter(k => k.configured).length || 0;
  const totalKeys = statusQuery.data?.apiKeys.length || 0;
  const connectedServices = statusQuery.data?.services.filter(s => s.status === "connected").length || 0;
  const totalServices = statusQuery.data?.services.length || 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="p-4 sm:p-6 border-b">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Settings className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold" data-testid="page-title">
                Integrations
              </h1>
              <p className="text-sm text-muted-foreground">
                Configure webhooks, API keys, and external services
              </p>
            </div>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 space-y-6">
          {statusQuery.isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-24 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : statusQuery.error ? (
            <Card>
              <CardContent className="p-8 text-center">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Failed to Load</h3>
                <p className="text-sm text-muted-foreground">
                  Could not load integration status. Please try again.
                </p>
              </CardContent>
            </Card>
          ) : statusQuery.data ? (
            <Tabs defaultValue="webhooks" className="w-full">
              <TabsList className="mb-4" data-testid="tabs-integrations">
                <TabsTrigger value="webhooks" data-testid="tab-webhooks">
                  <Webhook className="h-4 w-4 mr-2" />
                  Webhooks
                </TabsTrigger>
                <TabsTrigger value="apikeys" data-testid="tab-apikeys">
                  <Key className="h-4 w-4 mr-2" />
                  API Keys ({configuredCount}/{totalKeys})
                </TabsTrigger>
                <TabsTrigger value="services" data-testid="tab-services">
                  <Link2 className="h-4 w-4 mr-2" />
                  Services ({connectedServices}/{totalServices})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="webhooks" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-medium">Webhook Endpoints</h2>
                    <p className="text-sm text-muted-foreground">
                      Configure these URLs in your external services
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={copyAllWebhooks} data-testid="button-copy-all-webhooks">
                    <Copy className="h-4 w-4 mr-2" />
                    Copy All
                  </Button>
                </div>

                <Card className="bg-muted/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-sm">
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Current domain:</span>
                      <code className="bg-background px-2 py-1 rounded text-xs">
                        {statusQuery.data.domain}
                      </code>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4">
                  {statusQuery.data.webhooks.map((webhook) => (
                    <WebhookCard 
                      key={webhook.path} 
                      webhook={webhook} 
                      domain={statusQuery.data.domain} 
                    />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="apikeys" className="space-y-4">
                <div>
                  <h2 className="text-lg font-medium">API Key Status</h2>
                  <p className="text-sm text-muted-foreground">
                    Keys are stored securely and values are never displayed
                  </p>
                </div>

                <Card className="bg-muted/50">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2 text-sm">
                      <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <p className="text-muted-foreground">
                        To add or update API keys, use the Secrets tab in Replit or set environment variables directly.
                        Keys should never be committed to version control.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-2">
                  {statusQuery.data.apiKeys.map((apiKey) => (
                    <ApiKeyStatus key={apiKey.envVar} apiKey={apiKey} />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="services" className="space-y-4">
                <div>
                  <h2 className="text-lg font-medium">Connected Services</h2>
                  <p className="text-sm text-muted-foreground">
                    Status of external service integrations
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {statusQuery.data.services.map((service) => (
                    <ServiceCard key={service.name} service={service} />
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
