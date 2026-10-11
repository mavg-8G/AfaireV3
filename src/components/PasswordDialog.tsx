"use client";
import { useActionState, type RefObject } from "react";
import { changePassword } from "@/app/actions/auth";
import type { AuthFormState } from "@/lib/definitions";
import { useI18n } from "./LocaleProvider";
import { CloseIcon } from "./Icons";

function PasswordForm({ onCancel }: { onCancel: () => void }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(changePassword, {} as AuthFormState);
  return <form aria-busy={pending} action={action} className="mt-5 space-y-4">
    <label className="block text-sm">{t("Contraseña actual")}<input name="currentPassword" type="password" required autoComplete="current-password" className="field" /></label>
    <label className="block text-sm">{t("Nueva contraseña")}<input name="newPassword" type="password" required minLength={10} maxLength={72} autoComplete="new-password" className="field" /><span className="mt-1 block text-xs text-muted">{t("Entre 10 y 72 caracteres. Se cerrarán todas tus sesiones y se retirarán los avisos push.")}</span></label>
    {state.message && <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-sage" : "text-terracotta"}`}>{t(state.message)}</p>}
    {state.errors && <p role="alert" className="text-sm text-terracotta">{Object.values(state.errors).flat().filter(Boolean).map(value => t(value!)).join(" ")}</p>}
    {state.ok
      ? <a href="/login" className="btn btn-primary w-full">{t("Volver a iniciar sesión")}</a>
      : <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={onCancel} className="btn">{t("Cancelar")}</button><button disabled={pending} className="btn btn-primary">{pending ? t("Guardando…") : t("Cambiar contraseña")}</button></div>}
  </form>;
}

export function PasswordDialog({ dialogRef, session }: { dialogRef: RefObject<HTMLDialogElement | null>; session: number }) {
  const { t } = useI18n();
  const close = () => dialogRef.current?.close();
  return <dialog ref={dialogRef} aria-labelledby="password-title" className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-3xl border border-line bg-card p-0 text-ink shadow-lg">
    <div className="p-6">
      <div className="flex items-start justify-between gap-4"><h2 id="password-title" className="text-2xl">{t("Cambiar contraseña")}</h2><button type="button" onClick={close} aria-label={t("Cerrar")} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-sunken"><CloseIcon className="size-5" /></button></div>
      {/* A fresh form per opening clears typed passwords and old messages. */}
      <PasswordForm key={session} onCancel={close} />
    </div>
  </dialog>;
}
