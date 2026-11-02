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
      <div className="min-h-screen bg-[#070710] text-white flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="font-bold text-lg mb-2">Invalid reset link</h2>
          <p className="text-white/40 text-sm mb-6">This link is invalid or has expired. Please request a new one.</p>
          <Link href="/forgot-password">
            <Button className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold">Request new link</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070710] text-white flex flex-col items-center justify-center px-4">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-cyan-500/5 rounded-full blur-[100px]" />
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm relative">
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-xl shadow-cyan-500/30">
            <LineChart className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg">TradeAI <span className="text-cyan-400">Terminal</span></span>
        </div>

        {done ? (
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-green-400" />
            </div>
            <h2 className="font-bold text-lg mb-2">Password updated</h2>
            <p className="text-sm text-white/40">Redirecting you to login…</p>
          </div>
        ) : (
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8">
            <div className="mb-6">
              <h1 className="text-xl font-bold mb-1">Set new password</h1>
              <p className="text-sm text-white/40">Choose a strong password for your account.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-white/60">New password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <Input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="pl-9 pr-10 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-cyan-500/50"
                    required
                    minLength={8}
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/60">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <Input
                    type={showPass ? "text" : "password"}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat your password"
                    className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-cyan-500/50"
                    required
                  />
                </div>
              </div>
              {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
              <Button
                type="submit"
                disabled={loading || !password || !confirm}
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Updating…</> : "Update password"}
              </Button>
            </form>
          </div>
        )}

        <div className="mt-6 text-center">
          <Link href="/auth">
            <button className="text-xs text-white/30 hover:text-white/60 transition-colors">Back to login</button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
