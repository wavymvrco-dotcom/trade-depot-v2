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
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-info/5 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm relative"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-9 h-9 rounded-xl bg-info/10 flex items-center justify-center shadow-xl">
            <LineChart className="w-5 h-5 text-foreground" />
          </div>
          <span className="font-display font-semibold text-xl">Trade Depot</span>
        </div>

        {!sent ? (
          <div className="bg-white/[0.03] border border-foreground/10 rounded-2xl p-8">
            <div className="mb-6">
              <h1 className="text-xl font-bold mb-1">Forgot your password?</h1>
              <p className="text-sm text-foreground/40">Enter your email and we'll send you a reset link.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-foreground/60">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/30" />
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="pl-9 bg-foreground/5 border-foreground/10 text-foreground placeholder:text-foreground/20 focus:border-info/50"
                    required
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full bg-info hover:bg-info text-foreground font-semibold"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Sending…</> : "Send reset link"}
              </Button>
            </form>
          </div>
        ) : (
          <div className="bg-white/[0.03] border border-foreground/10 rounded-2xl p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-pos/10 border border-pos/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-pos" />
            </div>
            <h2 className="font-bold text-lg mb-2">Check your inbox</h2>
            <p className="text-sm text-foreground/40 mb-6">
              If an account exists for <span className="text-foreground/70">{email}</span>, you'll receive a password reset link shortly.
            </p>
            <p className="text-xs text-foreground/25">Didn't get it? Check your spam folder or try again in a few minutes.</p>
          </div>
        )}

        <div className="mt-6 text-center">
          <Link href="/auth">
            <button className="flex items-center gap-1.5 text-xs text-foreground/30 hover:text-foreground/60 transition-colors mx-auto">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to login
            </button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
