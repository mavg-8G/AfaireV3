"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
export function UsageTracker({ enabled }: { enabled: boolean }) {
  const path = usePathname(); const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    let lastInteraction = Date.now(); let lastSent = 0; let busy = false; let stopped = false;
    const touch = () => { lastInteraction = Date.now(); };
    const send = async () => {
      const now = Date.now();
      if (busy || document.visibilityState !== "visible" || now - lastSent < 5 * 60_000 || now - lastInteraction > 5 * 60_000) return;
      busy = true;
      try {
        const response = await fetch("/api/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        if (response.ok) { lastSent = now; if (!stopped) router.refresh(); }
      } catch { /* Usage learning never interrupts the agenda. */ }
      finally { busy = false; }
    };
    const visible = () => { if (document.visibilityState === "visible") { touch(); void send(); } };
    for (const name of ["pointerdown", "keydown", "pointermove"] as const) window.addEventListener(name, touch, { passive: true });
    document.addEventListener("visibilitychange", visible);
    void send();
    const timer = setInterval(() => { void send(); }, 60_000);
    return () => {
      stopped = true; clearInterval(timer);
      for (const name of ["pointerdown", "keydown", "pointermove"] as const) window.removeEventListener(name, touch);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [enabled, path, router]);
  return null;
}
