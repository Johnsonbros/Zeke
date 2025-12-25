import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Brain, 
  MessageSquare, 
  Calendar, 
  MapPin, 
  Mic, 
  Shield, 
  Zap, 
  Clock, 
  Users,
  Cpu,
  Radio,
  FileText,
  ChevronRight,
  Sparkles,
  Bot,
  Network,
  Activity,
  Headphones
} from "lucide-react";

function FeatureCard({ icon: Icon, title, description, keywords }: { 
  icon: React.ElementType; 
  title: string; 
  description: string;
  keywords: string[];
}) {
  return (
    <Card className="group relative overflow-visible border-border/50 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-foreground">{title}</h3>
        <p className="mb-4 text-sm text-muted-foreground leading-relaxed">{description}</p>
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((keyword) => (
            <Badge key={keyword} variant="secondary" className="text-xs font-normal">
              {keyword}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function UseCaseCard({ icon: Icon, title, description }: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4 p-4 rounded-lg border border-border/30 bg-card/30 backdrop-blur-sm">
      <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h4 className="font-medium text-foreground mb-1">{title}</h4>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function TechBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/50 bg-muted/30 text-sm text-muted-foreground">
      <Sparkles className="h-3 w-3 text-primary" />
      {children}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-lg font-bold text-primary-foreground">Z</span>
              </div>
              <span className="text-xl font-bold text-foreground">ZEKE</span>
              <Badge variant="outline" className="text-xs">AI Assistant</Badge>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login">
                <Button variant="ghost" data-testid="link-login">
                  Log In
                </Button>
              </Link>
              <Link href="/apply">
                <Button data-testid="link-early-access">
                  Early Access
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        </div>
        
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <div className="flex justify-center gap-2 mb-6 flex-wrap">
              <TechBadge>Multi-Agent Architecture</TechBadge>
              <TechBadge>Wearable Integration</TechBadge>
              <TechBadge>Proactive Intelligence</TechBadge>
            </div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight tracking-tight mb-6">
              Your Personal AI That{" "}
              <span className="text-primary">Actually Acts</span>
            </h1>
            
            <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed mb-8 max-w-2xl mx-auto">
              ZEKE is an action-oriented AI assistant that captures ambient memory, 
              manages communications, and proactively anticipates your needs through 
              wearable devices and intelligent automation.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/apply">
                <Button size="lg" className="gap-2 text-base px-8" data-testid="button-hero-early-access">
                  <Zap className="h-5 w-5" />
                  Request Early Access
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline" className="gap-2 text-base px-8" data-testid="button-hero-login">
                  Sign In
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            
            <div className="mt-10 flex items-center justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <span>Private & Secure</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <span>24/7 Proactive</span>
              </div>
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <span>Multi-Agent AI</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 border-t border-border/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <Badge variant="outline" className="mb-4">Core Capabilities</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Intelligence That Works For You
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Built on a sophisticated multi-agent architecture with specialized AI systems 
              for memory, communication, planning, research, and safety.
            </p>
          </div>
          
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={Brain}
              title="Multi-Agent AI System"
              description="Specialized agents work together: Conductor orchestrates, Memory Curator remembers, Comms Pilot handles communication, Ops Planner schedules, Research Scout investigates."
              keywords={["Conductor", "Memory Curator", "Ops Planner", "Research Scout"]}
            />
            <FeatureCard
              icon={Headphones}
              title="Wearable Integration"
              description="Connect AI wearables like Omi Pendant and Limitless for ambient memory capture. Real-time transcription with speaker diarization captures every important moment."
              keywords={["Omi Pendant", "Limitless", "Ambient AI", "Voice Capture"]}
            />
            <FeatureCard
              icon={MessageSquare}
              title="Unified Communications"
              description="SMS, MMS, voice calls, and AI chat in one unified thread. Smart image processing with face recognition and automatic context enhancement."
              keywords={["SMS/MMS", "Voice Calls", "Twilio", "Face Recognition"]}
            />
            <FeatureCard
              icon={Network}
              title="Knowledge Graph"
              description="Multi-hop reasoning across your personal knowledge base. Automatic entity extraction and relationship mapping for intelligent context retrieval."
              keywords={["Entity Extraction", "Multi-hop Reasoning", "Semantic Search"]}
            />
            <FeatureCard
              icon={Calendar}
              title="Smart Scheduling"
              description="Google Calendar integration with predictive task scheduling. Morning briefings anticipate your day with personalized news and agenda."
              keywords={["Calendar Sync", "Task Automation", "Daily Briefings"]}
            />
            <FeatureCard
              icon={MapPin}
              title="Location Intelligence"
              description="Context-aware location tracking with geofencing. Automatic place detection and location-based memory association."
              keywords={["Geofencing", "Location Awareness", "Place Detection"]}
            />
          </div>
        </div>
      </section>

      <section className="py-20 bg-muted/20 border-y border-border/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="outline" className="mb-4">Real-World Use Cases</Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                How ZEKE Transforms Your Day
              </h2>
              <p className="text-muted-foreground mb-8">
                From ambient memory capture during meetings to proactive morning briefings, 
                ZEKE anticipates and acts on your behalf.
              </p>
              
              <div className="space-y-4">
                <UseCaseCard
                  icon={Mic}
                  title="Ambient Memory Capture"
                  description="Wear your Omi Pendant and ZEKE automatically transcribes conversations, identifies speakers, and extracts actionable memories."
                />
                <UseCaseCard
                  icon={Activity}
                  title="Proactive Morning Briefings"
                  description="Wake up to personalized daily summaries with your agenda, urgent news, and AI-anticipated tasks for the day."
                />
                <UseCaseCard
                  icon={Users}
                  title="People Intelligence"
                  description="Automatic tracking of who you talk to, what you discussed, and relationship context for seamless follow-ups."
                />
                <UseCaseCard
                  icon={FileText}
                  title="Food & Preference Learning"
                  description="ZEKE learns your dietary preferences, favorite restaurants, and generates smart grocery lists based on your habits."
                />
              </div>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-2xl" />
              <Card className="relative border-border/50 bg-card/80 backdrop-blur-sm p-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 pb-4 border-b border-border/50">
                    <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                      <span className="text-lg font-bold text-primary-foreground">Z</span>
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">ZEKE</div>
                      <div className="text-xs text-muted-foreground">AI Assistant</div>
                    </div>
                    <Badge className="ml-auto text-xs">Online</Badge>
                  </div>
                  
                  <div className="space-y-3 text-sm">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">N</div>
                      <div className="bg-muted/50 rounded-lg p-3 max-w-[80%]">
                        <p className="text-foreground">What do I have today?</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-3 justify-end">
                      <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 max-w-[85%]">
                        <p className="text-foreground">Good morning! Here's your day:</p>
                        <ul className="mt-2 space-y-1 text-muted-foreground text-xs">
                          <li className="flex items-center gap-2">
                            <Calendar className="h-3 w-3 text-primary" />
                            9:00 AM - Team standup (Zoom)
                          </li>
                          <li className="flex items-center gap-2">
                            <Users className="h-3 w-3 text-primary" />
                            2:00 PM - Call with Sarah about project
                          </li>
                          <li className="flex items-center gap-2">
                            <FileText className="h-3 w-3 text-primary" />
                            3 tasks due today
                          </li>
                        </ul>
                        <p className="mt-2 text-foreground">Also, there's breaking news about the AI industry I flagged as relevant.</p>
                      </div>
                      <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">Z</div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <Badge variant="outline" className="mb-4">Technology Stack</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Built for Performance & Privacy
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Enterprise-grade infrastructure with cost-efficient batch processing, 
              real-time speech-to-text, and secure single-user architecture.
            </p>
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Cpu, label: "OpenAI GPT-5.2", desc: "Advanced reasoning" },
              { icon: Radio, label: "Deepgram STT", desc: "Real-time transcription" },
              { icon: MessageSquare, label: "Twilio", desc: "SMS & Voice" },
              { icon: Network, label: "Vector Embeddings", desc: "Semantic search" },
              { icon: Zap, label: "Batch API", desc: "50% cost savings" },
              { icon: Shield, label: "HMAC Auth", desc: "Secure access" },
              { icon: Activity, label: "WebSocket", desc: "Real-time sync" },
              { icon: Brain, label: "Knowledge Graph", desc: "Multi-hop reasoning" },
            ].map((tech) => (
              <Card key={tech.label} className="border-border/50 bg-card/50">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <tech.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground text-sm">{tech.label}</div>
                    <div className="text-xs text-muted-foreground">{tech.desc}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-primary/5 border-t border-border/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Ready to Experience the Future?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Join the waitlist for early access to ZEKE. Be among the first to 
            experience an AI assistant that actually takes action.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/apply">
              <Button size="lg" className="gap-2 text-base px-8" data-testid="button-cta-apply">
                <Sparkles className="h-5 w-5" />
                Apply for Early Access
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="gap-2 text-base px-8" data-testid="button-cta-login">
                Already have access? Sign In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="py-8 border-t border-border/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-sm font-bold text-primary-foreground">Z</span>
              </div>
              <span className="font-semibold text-foreground">ZEKE</span>
              <span className="text-sm text-muted-foreground">Personal AI Assistant</span>
            </div>
            
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/apply">
                <span className="hover-elevate cursor-pointer">Early Access</span>
              </Link>
              <Link href="/login">
                <span className="hover-elevate cursor-pointer">Sign In</span>
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
