import { getRequestPreferences } from "@/lib/request-preferences";
import { translator } from "@/lib/locale";
export default async function Loading() {
  const preferences = await getRequestPreferences(); const t = translator(preferences.locale); return <div role="status" className="space-y-5"><p className="text-sm text-muted">{t("Abriendo tu agenda…")}</p><div className="h-32 animate-pulse rounded-3xl bg-line/40" /><div className="h-60 animate-pulse rounded-3xl bg-line/25" /></div>; }
