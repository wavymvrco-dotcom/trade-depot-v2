import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { LineChart, Eye, EyeOff, Bot, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { InstallPrompt } from "@/components/InstallPrompt";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export default function Auth() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const { login, register } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const shouldOfferInstall =
    !isStandalone() &&
    localStorage.getItem("tradeai_install_dismissed") !== "true";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast({ title: "Required", description: "Please enter your username and password.", variant: "destructive" });
      return;
    }
    if (mode === "register" && password.length < 8) {
      toast({ title: "Weak password", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        await login(username.trim(), password);
        setLocation("/");
      } else {
        await register(username.trim(), password, email.trim() || undefined);
        // Offer install first; continue into the app once it's dismissed
        if (shouldOfferInstall) setShowInstall(true);
        else setLocation("/");
      }
    } catch (err: any) {
      const msg = err.message || "Something went wrong";
      toast({
        title: mode === "login" ? "Login failed" : "Registration failed",
        description: msg.includes("401") ? "Invalid username or password."
          : msg.includes("409") ? "Username already taken."
          : msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-primary/15 rounded-full blur-[128px] pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-accent/15 rounded-full blur-[128px] pointer-events-none" />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-4 shadow-2xl shadow-primary/30">
            <LineChart className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">TradeAI Terminal</h1>
          <p className="text-muted-foreground text-sm mt-1">Autonomous AI-powered trading</p>
        </div>

        <div className="bg-card/70 backdrop-blur-xl border border-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Tab switcher */}
          <div className="grid grid-cols-2 border-b border-border">
            {(["login", "register"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setMode(tab)}
                className={`py-4 text-sm font-semibold transition-all ${
                  mode === tab
                    ? "text-foreground border-b-2 border-primary -mb-px bg-card/50"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`tab-${tab}`}
              >
                {tab === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <div className="p-8">
            <AnimatePresence mode="wait">
              <motion.form
                key={mode}
                initial={{ opacity: 0, x: mode === "login" ? -10 : 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onSubmit={handleSubmit}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Username</Label>
                  <Input
                    data-testid="input-username"
                    placeholder="your_username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="h-11 bg-background/60 border-border/70 focus-visible:border-primary"
                    autoComplete="username"
                    autoFocus
                  />
                </div>

                {mode === "register" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      Email <span className="text-muted-foreground/50 normal-case">(optional — for password reset)</span>
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                      <Input
                        data-testid="input-email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-11 pl-9 bg-background/60 border-border/70 focus-visible:border-primary"
                        autoComplete="email"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Password</Label>
                    {mode === "login" && (
                      <Link href="/forgot-password">
                        <span className="text-[11px] text-primary hover:text-primary/80 transition-colors cursor-pointer">
                          Forgot password?
                        </span>
                      </Link>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      data-testid="input-password"
                      type={showPass ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 bg-background/60 border-border/70 focus-visible:border-primary pr-10"
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {mode === "register" && (
                    <p className="text-[11px] text-muted-foreground">At least 8 characters.</p>
                  )}
                </div>

                <Button
                  data-testid="button-submit"
                  type="submit"
                  className="w-full h-11 bg-primary hover:bg-primary/90 font-semibold mt-2"
                  disabled={loading}
                >
                  {loading
                    ? (mode === "login" ? "Signing in..." : "Creating account...")
                    : (mode === "login" ? "Sign In" : "Create Account & Continue")}
                </Button>
              </motion.form>
            </AnimatePresence>

            <div className="mt-5 pt-5 border-t border-border/50">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/15">
                <Bot className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {mode === "login"
                    ? "Sign in to access your trading terminal, positions, AI signals, and strategy profiles."
                    : "Free during beta — full access to all features. No credit card required."}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 text-center space-y-2">
          <p className="text-[11px] text-muted-foreground">
            By continuing you agree to our{" "}
            <Link href="/terms"><span className="text-primary hover:underline cursor-pointer">Terms of Service</span></Link>
            {" "}and{" "}
            <Link href="/privacy"><span className="text-primary hover:underline cursor-pointer">Privacy Policy</span></Link>
          </p>
          <Link href="/landing">
            <span className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer">← Back to home</span>
          </Link>
        </div>
      </motion.div>

      <AnimatePresence>
        {showInstall && (
          <InstallPrompt mode="modal" onDismiss={() => { setShowInstall(false); setLocation("/"); }} />
        )}
      </AnimatePresence>
    </div>
  );
}
