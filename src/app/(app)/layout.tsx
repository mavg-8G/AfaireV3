import { getRequestPreferences } from "@/lib/request-preferences";
import { translator } from "@/lib/locale";
import { requireUser } from "@/lib/dal";
import { AppNav } from "@/components/AppNav";
import { UsageTracker } from "@/components/UsageTracker";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const preferences = await getRequestPreferences(); const t = translator(preferences.locale);
  const user = await requireUser();
  return <div className="flex min-h-full flex-1 flex-col lg:flex-row">
    <a href="#main-content" className="skip-link">{t("Saltar al contenido")}</a>
    <UsageTracker enabled={user.adaptiveAvailability && user.onboardingCompleted} />
    <AppNav name={user.name} />
    <div className="flex min-w-0 flex-1 flex-col">
      <main id="main-content" tabIndex={-1} className="app-main mx-auto w-full max-w-6xl flex-1 pt-6 outline-none md:pt-10">{children}</main>
      <footer className="mx-auto hidden w-full max-w-6xl px-10 pb-6 text-xs text-muted lg:block">{t("Afaire v3 · un día a la vez")}</footer>
    </div>
  </div>;
}
