"use client";
import { useI18n } from "@/components/LocaleProvider";
import { createContext, useContext, useEffect, useState } from "react";
import { DeviceIcon, MoonIcon, SunIcon } from "./Icons";

export type Theme = "system" | "light" | "dark";
export const THEME_COLORS = { light: "#f2f4f1", dark: "#0e1412" } as const;
const ThemeContext = createContext<{ theme: Theme; change: (theme: Theme) => void } | null>(null);

export function ThemeProvider({ initialTheme, children }: { initialTheme: Theme; children: React.ReactNode }) {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    // Browsers pick the first matching theme-color meta, so every one is pointed at the effective theme.
    const update = () => {
      const dark = theme === "dark" || (theme === "system" && system.matches);
      document.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.setAttribute("content", dark ? THEME_COLORS.dark : THEME_COLORS.light));
    };
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

const OPTIONS: { value: Theme; label: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Claro", Icon: SunIcon },
  { value: "dark", label: "Nocturno", Icon: MoonIcon },
  { value: "system", label: "Sistema", Icon: DeviceIcon },
];

export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const context = useContext(ThemeContext);
  if (!context) return null;
  return <fieldset className="min-w-0">
    <legend className={compact ? "sr-only" : "mb-2 text-xs font-semibold text-muted"}>{t("Tema de apariencia")}</legend>
    <div className="grid grid-cols-3 gap-1 rounded-full bg-sunken p-1">
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = context.theme === value;
        return <button key={value} type="button" aria-pressed={selected} onClick={() => context.change(value)} title={t(label)}
          className={`flex min-h-9 items-center justify-center gap-1.5 rounded-full px-2 text-xs font-medium transition ${selected ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
          <Icon className="size-4" /><span className={compact ? "sr-only" : ""}>{t(label)}</span>
        </button>;
      })}
    </div>
  </fieldset>;
}
