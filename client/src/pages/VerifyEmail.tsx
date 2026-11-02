import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { LineChart, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function VerifyEmail() {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); setMessage("Invalid verification link."); return; }
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.ok) { setStatus("success"); setMessage("Your email has been verified successfully."); }
        else { setStatus("error"); setMessage(d.message || "Verification failed. Link may have expired."); }
      })
      .catch(() => { setStatus("error"); setMessage("Something went wrong. Please try again."); });
  }, [token]);

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
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 text-center">
          {status === "loading" && (
            <>
              <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mx-auto mb-4" />
              <h2 className="font-bold text-lg mb-2">Verifying your email…</h2>
              <p className="text-sm text-white/40">Please wait a moment.</p>
            </>
          )}
          {status === "success" && (
            <>
              <div className="w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-green-400" />
              </div>
              <h2 className="font-bold text-lg mb-2">Email verified!</h2>
              <p className="text-sm text-white/40 mb-6">{message}</p>
              <Link href="/"><Button className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold">Go to Terminal</Button></Link>
            </>
          )}
          {status === "error" && (
            <>
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-7 h-7 text-red-400" />
              </div>
              <h2 className="font-bold text-lg mb-2">Verification failed</h2>
              <p className="text-sm text-white/40 mb-6">{message}</p>
              <Link href="/"><Button variant="outline" className="border-white/10 text-white/50 hover:text-white">Go to Terminal</Button></Link>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
