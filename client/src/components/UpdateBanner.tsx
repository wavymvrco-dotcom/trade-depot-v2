import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, X } from "lucide-react";
import { useAppUpdate } from "@/hooks/useAppUpdate";

export function UpdateBanner() {
  const { updateAvailable } = useAppUpdate();
  const [dismissed, setDismissed] = useState(false);

  if (!updateAvailable || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="update-banner"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="overflow-hidden shrink-0"
      >
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/10 border-b border-primary/20 text-xs">
          <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <RefreshCw className="text-primary" style={{ width: 10, height: 10 }} />
          </div>
          <span className="text-primary/80 flex-1">
            A new version is available —{" "}
            <button
              onClick={() => window.location.reload()}
              data-testid="button-update-reload"
              className="font-semibold text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              click to update now
            </button>
          </span>
          <button
            onClick={() => setDismissed(true)}
            data-testid="button-update-dismiss"
            className="text-primary/40 hover:text-primary transition-colors text-base leading-none p-0.5"
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
