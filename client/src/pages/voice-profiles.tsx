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
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Mic,
  User,
  Plus,
  Trash2,
  RefreshCw,
  AudioWaveform,
  Star,
  Clock,
} from "lucide-react";
import { format } from "date-fns";

interface VoiceSample {
  id: string;
  profileId: string;
  audioUrl: string | null;
  duration: number | null;
  embedding: string | null;
  createdAt: string;
}

interface VoiceProfile {
  id: string;
  name: string;
  isDefault: boolean;
  sampleCount: number;
  createdAt: string;
  updatedAt: string;
  metadata: string | null;
  samples?: VoiceSample[];
}

function ProfileCard({ profile, onDelete }: { profile: VoiceProfile; onDelete: () => void }) {
  const { toast } = useToast();

  return (
    <Card data-testid={`voice-profile-card-${profile.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{profile.name}</CardTitle>
                {profile.isDefault && (
                  <Badge variant="secondary" className="gap-1">
                    <Star className="h-3 w-3" />
                    Default
                  </Badge>
                )}
              </div>
              <CardDescription className="text-sm">
                {profile.sampleCount} voice sample{profile.sampleCount !== 1 ? "s" : ""}
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Created {format(new Date(profile.createdAt), "MMM d, yyyy")}
          </div>
        </div>
        
        {profile.sampleCount > 0 && (
          <div className="flex items-center gap-2 py-2">
            <AudioWaveform className="h-4 w-4 text-primary" />
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full" 
                style={{ width: `${Math.min(profile.sampleCount * 20, 100)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {profile.sampleCount >= 5 ? "Ready" : `${5 - profile.sampleCount} more needed`}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground">
            Last updated {format(new Date(profile.updatedAt), "MMM d, h:mm a")}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-destructive hover:text-destructive"
            data-testid={`button-delete-profile-${profile.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddProfileDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; isDefault: boolean }) => {
      return apiRequest("/api/voice/profiles", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({ title: "Profile created", description: "Voice profile has been created." });
      queryClient.invalidateQueries({ queryKey: ["/api/voice/profiles"] });
      setOpen(false);
      setName("");
      setIsDefault(false);
      onSuccess();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ name, isDefault });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-profile">
          <Plus className="h-4 w-4 mr-2" />
          Add Voice Profile
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Voice Profile</DialogTitle>
          <DialogDescription>
            Create a voice profile for speaker identification. You can add voice samples later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Nate"
              required
              data-testid="input-profile-name"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="is-default">Set as Default</Label>
              <p className="text-xs text-muted-foreground">
                Use this profile when speaker is unknown
              </p>
            </div>
            <Switch
              id="is-default"
              checked={isDefault}
              onCheckedChange={setIsDefault}
              data-testid="switch-is-default"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-profile">
              {createMutation.isPending ? "Creating..." : "Create Profile"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function VoiceProfilesPage() {
  const { toast } = useToast();

  const { data: profiles, isLoading, refetch } = useQuery<VoiceProfile[]>({
    queryKey: ["/api/voice/profiles"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/voice/profiles/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast({ title: "Profile deleted", description: "The voice profile has been removed." });
      queryClient.invalidateQueries({ queryKey: ["/api/voice/profiles"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const defaultProfile = profiles?.find((p) => p.isDefault);
  const otherProfiles = profiles?.filter((p) => !p.isDefault) || [];

  return (
    <ScrollArea className="h-full">
      <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Voice Profiles</h1>
            <p className="text-muted-foreground">
              Manage voice profiles for speaker identification
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              data-testid="button-refresh-profiles"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <AddProfileDialog onSuccess={() => {}} />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mic className="h-4 w-4" />
              How Voice Enrollment Works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Voice profiles enable ZEKE to identify who is speaking. Each profile 
              needs at least 5 voice samples for accurate speaker identification.
            </p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Create a voice profile with the speaker's name</li>
              <li>Record voice samples through the companion app</li>
              <li>ZEKE will learn to identify the speaker's voice</li>
            </ol>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : profiles && profiles.length > 0 ? (
          <div className="space-y-6">
            {defaultProfile && (
              <div>
                <h2 className="text-lg font-medium mb-3 flex items-center gap-2">
                  <Star className="h-4 w-4 text-yellow-500" />
                  Default Profile
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <ProfileCard
                    profile={defaultProfile}
                    onDelete={() => deleteMutation.mutate(defaultProfile.id)}
                  />
                </div>
              </div>
            )}
            {otherProfiles.length > 0 && (
              <div>
                <h2 className="text-lg font-medium mb-3">
                  Other Profiles ({otherProfiles.length})
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {otherProfiles.map((profile) => (
                    <ProfileCard
                      key={profile.id}
                      profile={profile}
                      onDelete={() => deleteMutation.mutate(profile.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Voice Profiles</h3>
              <p className="text-muted-foreground mb-4">
                Create a voice profile to enable speaker identification
              </p>
              <AddProfileDialog onSuccess={() => {}} />
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}
