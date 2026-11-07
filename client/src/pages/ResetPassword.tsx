import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { LineChart, Lock, Eye, EyeOff, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const token = new URLSearchParams(window.location.search).get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Reset failed. Link may have expired."); return; }
      setDone(true);
      setTimeout(() => setLocation("/auth"), 2500);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <XCircle className="w-12 h-12 text-neg mx-auto mb-4" />
          <h2 className="font-bold text-lg mb-2">Invalid reset link</h2>
          <p className="text-foreground/40 text-sm mb-6">This link is invalid or has expired. Please request a new one.</p>
          <Link href="/forgot-password">
            <Button className="bg-info hover:bg-info text-foreground font-semibold">Request new link</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-info/5 rounded-full blur-[100px]" />
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm relative">
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-9 h-9 rounded-xl bg-info/10 flex items-center justify-center shadow-xl">
            <LineChart className="w-5 h-5 text-foreground" />
          </div>
          <span className="font-display font-semibold text-xl">Trade Depot</span>
        </div>

        {done ? (
          <div className="bg-white/[0.03] border border-foreground/10 rounded-2xl p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-pos/10 border border-pos/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-pos" />
            </div>
            <h2 className="font-bold text-lg mb-2">Password updated</h2>
            <p className="text-sm text-foreground/40">Redirecting you to login…</p>
          </div>
        ) : (
          <div className="bg-white/[0.03] border border-foreground/10 rounded-2xl p-8">
            <div className="mb-6">
              <h1 className="text-xl font-bold mb-1">Set new password</h1>
              <p className="text-sm text-foreground/40">Choose a strong password for your account.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-foreground/60">New password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/30" />
                  <Input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="pl-9 pr-10 bg-foreground/5 border-foreground/10 text-foreground placeholder:text-foreground/20 focus:border-info/50"
                    required
                    minLength={8}
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/30 hover:text-foreground/60">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-foreground/60">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/30" />
                  <Input
                    type={showPass ? "text" : "password"}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat your password"
                    className="pl-9 bg-foreground/5 border-foreground/10 text-foreground placeholder:text-foreground/20 focus:border-info/50"
                    required
                  />
                </div>
              </div>
              {error && <p className="text-xs text-neg bg-neg/10 border border-neg/20 rounded-lg px-3 py-2">{error}</p>}
              <Button
                type="submit"
                disabled={loading || !password || !confirm}
                className="w-full bg-info hover:bg-info text-foreground font-semibold"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Updating…</> : "Update password"}
              </Button>
            </form>
          </div>
        )}

        <div className="mt-6 text-center">
          <Link href="/auth">
            <button className="text-xs text-foreground/30 hover:text-foreground/60 transition-colors">Back to login</button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
