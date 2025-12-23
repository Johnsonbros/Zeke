import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Phone, Shield, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

type Step = "phone" | "code";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { requestCode, verifyCode, authenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (authenticated) {
    setLocation("/");
    return null;
  }

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const result = await requestCode(phoneNumber);
    setIsLoading(false);

    if (result.success && result.sessionId) {
      setSessionId(result.sessionId);
      setStep("code");
      toast({
        title: "Code Sent",
        description: "Check your phone for the verification code.",
      });
    } else {
      setError(result.error || "Failed to send code");
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const result = await verifyCode(sessionId, code);
    setIsLoading(false);

    if (result.success) {
      toast({
        title: "Welcome Back",
        description: "You have been successfully logged in.",
      });
      setLocation("/");
    } else {
      setError(result.error || "Failed to verify code");
    }
  };

  const handleBack = () => {
    setStep("phone");
    setCode("");
    setError("");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center">
            <span className="text-2xl font-bold text-primary-foreground">Z</span>
          </div>
          <h1 className="text-3xl font-bold">ZEKE Dashboard</h1>
          <p className="text-muted-foreground">
            Secure access to your personal AI assistant
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {step === "code" && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBack}
                  className="h-8 w-8"
                  data-testid="button-back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              {step === "phone" ? (
                <>
                  <Phone className="h-5 w-5" />
                  Phone Verification
                </>
              ) : (
                <>
                  <Shield className="h-5 w-5" />
                  Enter Code
                </>
              )}
            </CardTitle>
            <CardDescription>
              {step === "phone"
                ? "Enter your phone number to receive a verification code"
                : "Enter the 4-digit code sent to your phone"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === "phone" ? (
              <form onSubmit={handleRequestCode} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    required
                    data-testid="input-phone"
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive" data-testid="text-error">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || !phoneNumber}
                  data-testid="button-send-code"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending Code...
                    </>
                  ) : (
                    "Send Verification Code"
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Verification Code</Label>
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    placeholder="1234"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    required
                    className="text-center text-2xl tracking-widest"
                    data-testid="input-code"
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive" data-testid="text-error">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || code.length !== 4}
                  data-testid="button-verify-code"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify & Login"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setCode("");
                    handleRequestCode({ preventDefault: () => {} } as React.FormEvent);
                  }}
                  disabled={isLoading}
                  data-testid="button-resend-code"
                >
                  Resend Code
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Want your own ZEKE agent?{" "}
            <Link href="/apply" className="text-primary underline-offset-4 hover:underline">
              Apply now
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
