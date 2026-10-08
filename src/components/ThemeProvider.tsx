"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "system" | "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; change: (theme: Theme) => void } | null>(null);

export function ThemeProvider({ initialTheme, children }: { initialTheme: Theme; children: React.ReactNode }) {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" || (theme === "system" && system.matches) ? "#151a18" : "#3f6b58");
    update();
    system.addEventListener("change", update);
    return () => system.removeEventListener("change", update);
  }, [theme]);
  function change(value: Theme) {
    document.documentElement.dataset.theme = value;
    document.cookie = `afaire-theme=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setTheme(value);
  }
  return <ThemeContext.Provider value={{ theme, change }}>{children}</ThemeContext.Provider>;
}

export function ThemePicker() {
  const context = useContext(ThemeContext);
  if (!context) return null;
  return <label className="flex items-center gap-2 text-sm text-muted">Tema<select aria-label="Tema de apariencia" value={context.theme} onChange={event => context.change(event.target.value as Theme)} className="rounded-lg border border-line bg-card px-2 py-1 text-ink"><option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Nocturno</option></select></label>;
}
