"use client";
import { useI18n } from "@/components/LocaleProvider";
import { RefreshIcon } from "@/components/Icons";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useI18n();
  return <div className="mx-auto mt-6 max-w-lg rounded-3xl border border-line bg-card p-8 text-center shadow-md"><h1 className="text-3xl">{t("No pudimos abrir tu agenda")}</h1><p className="mt-4 text-sm text-muted">{t("Comprueba la conexión y vuelve a intentarlo. Tus datos guardados se conservan.")}</p><button onClick={reset} className="btn btn-primary mt-6 px-6"><RefreshIcon />{t("Volver a intentar")}</button></div>;
}
