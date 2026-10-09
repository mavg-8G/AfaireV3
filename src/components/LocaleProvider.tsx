"use client";
import { createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_PREFERENCES, translator, type Preferences } from "@/lib/locale";
const Context = createContext<Preferences>(DEFAULT_PREFERENCES);
export function LocaleProvider({ preferences, children }: { preferences: Preferences; children: React.ReactNode }) { return <Context.Provider value={preferences}>{children}</Context.Provider>; }
export function useI18n() { const preferences = useContext(Context); return { preferences, t: translator(preferences.locale) }; }
export function LanguagePicker() {
  const { preferences, t } = useI18n(); const router = useRouter();
  return <label className="flex items-center gap-2 text-sm text-muted">{t("Idioma")}<select aria-label={t("Idioma")} value={preferences.locale} onChange={e => { document.cookie = "afaire-locale=" + e.target.value + "; Path=/; Max-Age=31536000; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : ""); router.refresh(); }} className="rounded-lg border border-line bg-card px-2 py-1 text-ink"><option value="es">Español</option><option value="en">English</option></select></label>;
}
