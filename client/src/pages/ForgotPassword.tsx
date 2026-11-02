import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { LineChart, Mail, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setSent(true);
    } catch {
      toast({ title: "Something went wrong", description: "Please try again later.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070710] text-white flex flex-col items-center justify-center px-4">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-cyan-500/5 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm relative"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-xl shadow-cyan-500/30">
            <LineChart className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg">TradeAI <span className="text-cyan-400">Terminal</span></span>
        </div>

        {!sent ? (
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8">
            <div className="mb-6">
              <h1 className="text-xl font-bold mb-1">Forgot your password?</h1>
              <p className="text-sm text-white/40">Enter your email and we'll send you a reset link.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-white/60">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-cyan-500/50"
                    required
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Sending…</> : "Send reset link"}
              </Button>
            </form>
          </div>
        ) : (
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-green-400" />
            </div>
            <h2 className="font-bold text-lg mb-2">Check your inbox</h2>
            <p className="text-sm text-white/40 mb-6">
              If an account exists for <span className="text-white/70">{email}</span>, you'll receive a password reset link shortly.
            </p>
            <p className="text-xs text-white/25">Didn't get it? Check your spam folder or try again in a few minutes.</p>
          </div>
        )}

        <div className="mt-6 text-center">
          <Link href="/auth">
            <button className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors mx-auto">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to login
            </button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
