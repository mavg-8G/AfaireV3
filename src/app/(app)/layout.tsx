import { getRequestPreferences } from "@/lib/request-preferences";
import { translator } from "@/lib/locale";
import { requireUser } from "@/lib/dal";
import { AppNav } from "@/components/AppNav";
import { UsageTracker } from "@/components/UsageTracker";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const preferences = await getRequestPreferences(); const t = translator(preferences.locale);
  const user = await requireUser();
  return <><a href="#main-content" className="skip-link">{t("Saltar al contenido")}</a><UsageTracker enabled={user.adaptiveAvailability && user.onboardingCompleted} /><AppNav name={user.name} /><main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:py-10">{children}</main><footer className="mx-auto w-full max-w-6xl px-5 pb-6 text-xs text-muted">{t("Afaire v3 · un día a la vez")}</footer></>;
}
