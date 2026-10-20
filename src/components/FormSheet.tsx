"use client";
import { useRef } from "react";
import { useI18n } from "@/components/LocaleProvider";
import { CloseIcon, PlusIcon } from "./Icons";

// Phones open the creation form from a floating button as a bottom sheet; desktop keeps it inline (.form-sheet becomes display: contents).
export function FormSheet({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useI18n(); const sheet = useRef<HTMLDialogElement>(null);
  const close = () => sheet.current?.close();
  return <>
    <button type="button" onClick={() => sheet.current?.showModal()} aria-haspopup="dialog"
      className="floating-above-tabbar btn btn-primary fixed right-4 z-20 gap-2 rounded-full shadow-lg lg:hidden"><PlusIcon className="size-5" />{t(label)}</button>
    {/* Forms reset themselves after a successful save, which is the cue to close. */}
    <dialog ref={sheet} aria-label={t(label)} onReset={close} onClick={event => { if (event.target === event.currentTarget) close(); }}
      className="more-sheet form-sheet mx-auto mb-0 mt-auto w-full max-w-xl overflow-y-auto rounded-t-3xl border border-b-0 border-line bg-card p-0 text-ink shadow-lg">
      <div className="flex items-center justify-between px-5 pt-3 lg:hidden">
        <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-line" />
        <button type="button" onClick={close} aria-label={t("Cerrar")} className="grid size-10 place-items-center rounded-full hover:bg-sunken"><CloseIcon className="size-5" /></button>
      </div>
      <div className="px-3 lg:contents">{children}</div>
    </dialog>
  </>;
}
