import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles } from "lucide-react";
import { APP_VERSION, WHATS_NEW } from "@/lib/changelog";

const SEEN_KEY = "tradeai_version";

export function WhatsNewModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // First-run users get the guided tour instead; a changelog means nothing
    // to them yet, and two stacked modals block each other's buttons
    if (localStorage.getItem("tradeai_tour_seen") !== "true") {
      localStorage.setItem(SEEN_KEY, APP_VERSION);
      return;
    }
    const seen = localStorage.getItem(SEEN_KEY);
    if (seen !== APP_VERSION) {
      const t = setTimeout(() => setOpen(true), 1500);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(SEEN_KEY, APP_VERSION);
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="whats-new-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9990] bg-black/60 backdrop-blur-sm"
            onClick={dismiss}
          />
          <motion.div
            key="whats-new-card"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed z-[9991] inset-x-4 top-1/2 -translate-y-1/2 mx-auto max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="px-5 pt-5 pb-4 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Sparkles className="w-4.5 h-4.5 text-primary" style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <div className="font-bold text-sm">What's New</div>
                  <div className="text-[10px] text-muted-foreground font-mono">v{APP_VERSION}</div>
                </div>
              </div>
              <button
                onClick={dismiss}
                data-testid="button-whats-new-dismiss"
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-72 overflow-y-auto">
              {WHATS_NEW.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-xl leading-none mt-0.5 shrink-0">{item.icon}</span>
                  <div>
                    <div className="text-xs font-semibold text-foreground mb-0.5">{item.title}</div>
                    <div className="text-[11px] text-muted-foreground leading-relaxed">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-3 border-t border-border/50">
              <button
                onClick={dismiss}
                data-testid="button-whats-new-close"
                className="w-full bg-primary text-primary-foreground text-xs font-semibold py-2.5 rounded-lg hover:bg-primary/90 transition-colors"
              >
                Got it — let's go
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
