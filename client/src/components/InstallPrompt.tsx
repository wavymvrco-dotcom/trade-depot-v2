import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Share, MoreVertical, Plus, Smartphone, Monitor, Chrome } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Platform = "ios" | "android" | "desktop" | "unknown";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows|Macintosh|Linux/.test(ua)) return "desktop";
  return "unknown";
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

interface InstallPromptProps {
  mode?: "modal" | "banner";
  onDismiss?: () => void;
}

export function InstallPrompt({ mode = "modal", onDismiss }: InstallPromptProps) {
  const platform = detectPlatform();

  const handleDismiss = () => {
    localStorage.setItem("tradeai_install_dismissed", "true");
    onDismiss?.();
  };

  const steps: { icon: React.ReactNode; text: string }[] =
    platform === "ios"
      ? [
          { icon: <Share className="w-4 h-4 text-info shrink-0" />,     text: 'Tap the Share button at the bottom of Safari (the box with an arrow pointing up)' },
          { icon: <Plus  className="w-4 h-4 text-info shrink-0" />,     text: 'Scroll down and tap "Add to Home Screen"' },
          { icon: <Smartphone className="w-4 h-4 text-info shrink-0" aria-hidden="true" />, text: 'Tap "Add" — Trade Depot will appear on your home screen like a native app' },
        ]
      : platform === "android"
      ? [
          { icon: <MoreVertical className="w-4 h-4 text-pos shrink-0" />, text: 'Tap the three-dot menu in Chrome (top right corner)' },
          { icon: <Plus className="w-4 h-4 text-pos shrink-0" />,         text: 'Tap "Add to Home screen" or "Install app"' },
          { icon: <Smartphone className="w-4 h-4 text-info shrink-0" aria-hidden="true" />,   text: 'Tap "Add" — Trade Depot will appear as a full-screen app' },
        ]
      : [
          { icon: <Chrome className="w-4 h-4 text-info shrink-0" />, text: 'In Chrome or Edge, look for the install icon (⊕) in the address bar' },
          { icon: <Plus className="w-4 h-4 text-info shrink-0" />,   text: 'Click "Install Trade Depot" and confirm' },
          { icon: <Monitor className="w-4 h-4 text-info shrink-0" />, text: 'The app opens in its own window, no browser chrome — works offline too' },
        ];

  const platformColor = platform === "ios" ? "text-info" : platform === "android" ? "text-pos" : "text-primary";
  const platformBg    = platform === "ios" ? "bg-info/10 border-info/20" : platform === "android" ? "bg-pos/10 border-pos/20" : "bg-primary/10 border-primary/20";

  if (mode === "banner") {
    return (
      <motion.div
        initial={{ opacity: 0, y: -40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -40 }}
        className="w-full bg-card/90 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3"
      >
        <Smartphone className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Install Trade Depot on your device</p>
          <p className="text-xs text-muted-foreground">
            {platform === "ios"
              ? "Tap Share → Add to Home Screen in Safari for the full app experience"
              : platform === "android"
              ? "Tap ⋮ → Add to Home screen in Chrome for a native-like experience"
              : "Install via Chrome or Edge for a standalone app experience"}
          </p>
        </div>
        <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground shrink-0 p-1">
          <X className="w-4 h-4" />
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className={cn("px-5 pt-5 pb-4 border-b border-border", platformBg)}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shrink-0">
                <Smartphone className="w-6 h-6 text-foreground" />
              </div>
              <div>
                <p className="font-bold text-base">Add to Home Screen</p>
                <p className={cn("text-xs font-medium", platformColor)}>
                  {platform === "ios" ? "Safari on iPhone / iPad"
                   : platform === "android" ? "Chrome on Android"
                   : "Chrome or Edge on Desktop"}
                </p>
              </div>
            </div>
            <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground p-1 -mr-1 -mt-1">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            Save <strong className="text-foreground">Trade Depot</strong> to your home screen for a full-screen, app-like experience — no browser bar, works offline.
          </p>
        </div>

        {/* Steps */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {platform === "ios" ? "iPhone / iPad" : platform === "android" ? "Android" : "Desktop"} instructions
          </p>
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0 mt-0.5">
                {i + 1}
              </div>
              <div className="flex items-start gap-2 flex-1">
                {s.icon}
                <p className="text-sm text-foreground/90 leading-snug">{s.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleDismiss} data-testid="button-install-dismiss">
            Maybe later
          </Button>
          <Button className="flex-1 gap-2" onClick={handleDismiss} data-testid="button-install-got-it">
            Got it!
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function useInstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Don't show if already installed as PWA
    if (isStandalone()) return;
    // Don't show if already dismissed
    if (localStorage.getItem("tradeai_install_dismissed") === "true") return;
    // Show after a short delay for initial load
    const t = setTimeout(() => setShow(true), 1200);
    return () => clearTimeout(t);
  }, []);

  return { show, setShow };
}
