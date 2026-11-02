import { useState, useEffect, useRef } from "react";

export function useAppUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const versionRef = useRef<string | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { version } = await res.json();
        if (versionRef.current === null) {
          versionRef.current = version;
        } else if (versionRef.current !== version) {
          setUpdateAvailable(true);
        }
      } catch {}
    };

    check();
    const id = setInterval(check, 3 * 60 * 1000);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        setUpdateAvailable(true);
      });
    }

    return () => clearInterval(id);
  }, []);

  return { updateAvailable };
}
