import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

const shortcuts = [
  { keys: ["B"], desc: "Quick BUY order at market", category: "Trading" },
  { keys: ["S"], desc: "Quick SELL order at market", category: "Trading" },
  { keys: ["Ctrl", "C"], desc: "Close all open positions", category: "Trading" },
  { keys: ["Esc"], desc: "Cancel / close modals", category: "Trading" },
  { keys: ["Alt", "1"], desc: "1-minute chart", category: "Charts" },
  { keys: ["Alt", "5"], desc: "5-minute chart", category: "Charts" },
  { keys: ["Alt", "H"], desc: "1-hour chart", category: "Charts" },
  { keys: ["Alt", "D"], desc: "Daily chart", category: "Charts" },
  { keys: ["G"], desc: "Go to Dashboard", category: "Navigation" },
  { keys: ["A"], desc: "Go to AI Advisor", category: "Navigation" },
  { keys: ["J"], desc: "Go to Journal", category: "Navigation" },
  { keys: ["M"], desc: "Go to Marketplace", category: "Navigation" },
  { keys: ["N"], desc: "Go to Analytics", category: "Navigation" },
  { keys: ["L"], desc: "Go to Learn", category: "Navigation" },
  { keys: ["D"], desc: "Toggle dark / light theme", category: "UI" },
  { keys: ["?"], desc: "Show keyboard shortcut guide", category: "Help" },
];

const NAV_MAP: Record<string, string> = {
  g: "/", a: "/ai", j: "/journal", m: "/marketplace", n: "/analytics", l: "/learn",
};

interface Props {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function KeyboardShortcuts({ open: controlledOpen, onOpenChange }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [, setLocation] = useLocation();

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable;
      if (isInput) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      const key = e.key.toLowerCase();

      // Navigation shortcuts
      if (NAV_MAP[key]) {
        e.preventDefault();
        setLocation(NAV_MAP[key]);
        return;
      }

      // Theme toggle
      if (key === "d") {
        e.preventDefault();
        const dark = document.documentElement.classList.toggle("dark");
        try { localStorage.setItem("td_theme", dark ? "dark" : "light"); } catch {}
        return;
      }

      // Help
      if (e.key === "?") {
        e.preventDefault();
        setOpen(true);
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const categories = Array.from(new Set(shortcuts.map(s => s.category)));

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border-border">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>Pro trading keyboard commands</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {categories.map((category) => (
            <motion.div key={category} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">{category}</h4>
              <div className="space-y-1.5">
                {shortcuts.filter(s => s.category === category).map((shortcut, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded bg-muted/50 hover:bg-muted transition-colors">
                    <span className="text-sm">{shortcut.desc}</span>
                    <div className="flex items-center gap-1 shrink-0 ml-3">
                      {shortcut.keys.map((key, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-[10px] text-muted-foreground">+</span>}
                          <Badge variant="outline" className="font-mono text-xs h-6 px-1.5">{key}</Badge>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
