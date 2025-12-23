import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Users, Clock, CheckCircle, XCircle, Timer, Mail, Phone, MessageSquare, Calendar } from "lucide-react";
import type { AgentApplication, ApplicationStatus } from "@shared/schema";

const statusConfig: Record<ApplicationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  pending: { label: "Pending", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  approved: { label: "Approved", variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
  rejected: { label: "Rejected", variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
  waitlisted: { label: "Waitlisted", variant: "outline", icon: <Timer className="h-3 w-3" /> },
};

function ApplicationCard({ 
  application, 
  onReview 
}: { 
  application: AgentApplication; 
  onReview: (app: AgentApplication) => void;
}) {
  const config = statusConfig[application.status];
  const createdDate = new Date(application.createdAt).toLocaleDateString();

  return (
    <Card className="hover-elevate cursor-pointer" onClick={() => onReview(application)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold" data-testid={`text-name-${application.id}`}>
                {application.firstName} {application.lastName}
              </h3>
              <Badge variant={config.variant} className="gap-1">
                {config.icon}
                {config.label}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {application.email}
              </span>
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {application.phoneNumber}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {createdDate}
              </span>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
              {application.useCase}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewDialog({ 
  application, 
  onClose,
  onUpdate
}: { 
  application: AgentApplication | null; 
  onClose: () => void;
  onUpdate: (id: string, status: ApplicationStatus, reviewNotes: string) => void;
}) {
  const [status, setStatus] = useState<ApplicationStatus>(application?.status || "pending");
  const [reviewNotes, setReviewNotes] = useState(application?.reviewNotes || "");

  if (!application) return null;

  const config = statusConfig[application.status];

  return (
    <Dialog open={!!application} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Application Review
          </DialogTitle>
          <DialogDescription>
            Review and update the application status
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Name</label>
              <p className="font-medium">{application.firstName} {application.lastName}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Current Status</label>
              <div>
                <Badge variant={config.variant} className="gap-1 mt-1">
                  {config.icon}
                  {config.label}
                </Badge>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Email</label>
              <p>{application.email}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Phone</label>
              <p>{application.phoneNumber}</p>
            </div>
          </div>
          
          <div>
            <label className="text-sm font-medium text-muted-foreground">Use Case</label>
            <p className="mt-1 text-sm bg-muted p-3 rounded-md">{application.useCase}</p>
          </div>
          
          {application.howHeard && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">How They Heard About Us</label>
              <p className="capitalize">{application.howHeard}</p>
            </div>
          )}
          
          {application.notes && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Additional Notes</label>
              <p className="mt-1 text-sm bg-muted p-3 rounded-md">{application.notes}</p>
            </div>
          )}
          
          <div className="border-t pt-4 space-y-4">
            <div>
              <label className="text-sm font-medium">Update Status</label>
              <Select value={status} onValueChange={(v) => setStatus(v as ApplicationStatus)}>
                <SelectTrigger className="mt-1" data-testid="select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="waitlisted">Waitlisted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium">Review Notes</label>
              <Textarea
                placeholder="Add notes about this application..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="mt-1"
                data-testid="textarea-review-notes"
              />
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel">
            Cancel
          </Button>
          <Button 
            onClick={() => onUpdate(application.id, status, reviewNotes)}
            data-testid="button-save"
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ApplicationsPage() {
  const [selectedApp, setSelectedApp] = useState<AgentApplication | null>(null);
  const [activeTab, setActiveTab] = useState<string>("pending");

  const { data: statsData } = useQuery<{ success: boolean; stats: Record<string, number> }>({
    queryKey: ["/api/applications/stats/summary"],
  });

  const { data: appsData, isLoading } = useQuery<{ success: boolean; applications: AgentApplication[] }>({
    queryKey: ["/api/applications"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, reviewNotes }: { id: string; status: ApplicationStatus; reviewNotes: string }) => {
      const response = await apiRequest("PATCH", `/api/applications/${id}`, { status, reviewNotes });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/applications/stats/summary"] });
      setSelectedApp(null);
    },
  });

  const stats = statsData?.stats || { total: 0, pending: 0, approved: 0, rejected: 0, waitlisted: 0 };
  const applications = appsData?.applications || [];

  const filteredApps = activeTab === "all" 
    ? applications 
    : applications.filter(app => app.status === activeTab);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-4 md:p-6 border-b">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <Users className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Applications</h1>
            <p className="text-sm text-muted-foreground">Manage ZEKE agent applications</p>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold" data-testid="stat-pending">{stats.pending}</div>
            <p className="text-sm text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold" data-testid="stat-approved">{stats.approved}</div>
            <p className="text-sm text-muted-foreground">Approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold" data-testid="stat-waitlisted">{stats.waitlisted}</div>
            <p className="text-sm text-muted-foreground">Waitlisted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold" data-testid="stat-total">{stats.total}</div>
            <p className="text-sm text-muted-foreground">Total</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col px-4 md:px-6 pb-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList>
            <TabsTrigger value="pending" data-testid="tab-pending">Pending ({stats.pending})</TabsTrigger>
            <TabsTrigger value="approved" data-testid="tab-approved">Approved ({stats.approved})</TabsTrigger>
            <TabsTrigger value="waitlisted" data-testid="tab-waitlisted">Waitlisted ({stats.waitlisted})</TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all">All ({stats.total})</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="flex-1 overflow-hidden mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredApps.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <Users className="h-8 w-8 mb-2" />
                <p>No applications found</p>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="space-y-3 pr-4">
                  {filteredApps.map((app) => (
                    <ApplicationCard 
                      key={app.id} 
                      application={app} 
                      onReview={setSelectedApp}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ReviewDialog
        application={selectedApp}
        onClose={() => setSelectedApp(null)}
        onUpdate={(id, status, reviewNotes) => updateMutation.mutate({ id, status, reviewNotes })}
      />
    </div>
  );
}
