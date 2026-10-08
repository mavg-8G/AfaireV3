"use client";
import { useRef, useState } from "react";
import { usePwa } from "./PwaProvider";
export function InstallButton() {
  const pwa = usePwa(); const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false); const [error, setError] = useState("");
  if (pwa.installed) return null;
  return <>
    <button disabled={pending} className="rounded-full border border-sage/30 px-3 py-1.5 text-xs text-sage hover:bg-sage/5" onClick={async () => {
      setError("");
      if (!pwa.canPrompt) { dialog.current?.showModal(); return; }
      setPending(true);
      try { await pwa.install(); } catch { setError("No se pudo abrir la instalación. Puedes usar el menú de tu navegador."); dialog.current?.showModal(); }
      finally { setPending(false); }
    }}>{pending ? "Abriendo…" : "Instalar Afaire ↓"}</button>
    <dialog ref={dialog} aria-labelledby="install-title" className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-line bg-card p-7 text-ink shadow-xl">
      <h2 id="install-title" className="text-3xl">Afaire, a un toque</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted">Abre tu agenda desde el inicio de tu dispositivo, en su propia ventana.</p>
      {error && <p role="alert" className="mt-3 text-sm text-terracotta">{error}</p>}
      {!pwa.secure ? <p className="mt-5 text-sm leading-relaxed">Abre Afaire mediante HTTPS para instalarla en este dispositivo.</p>
        : pwa.ios ? <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm"><li>Abre esta página en Safari.</li><li>Pulsa Compartir y elige <strong>Añadir a pantalla de inicio</strong>.</li><li>Confirma el nombre Afaire y pulsa Añadir.</li></ol>
        : <p className="mt-5 text-sm leading-relaxed">En Chrome o Edge, abre el menú del navegador y elige <strong>Instalar Afaire</strong> o <strong>Añadir a pantalla de inicio</strong>. En Safari para Mac, usa <strong>Archivo → Añadir al Dock</strong>. La opción depende del navegador y del dispositivo.</p>}
      <p className="mt-5 text-xs leading-relaxed text-muted">Tu cuenta sigue siendo privada. Necesitas conexión para consultar o modificar la agenda.</p>
      <button className="mt-6 rounded-full bg-sage px-5 py-2.5 text-sm text-white" onClick={() => dialog.current?.close()}>Entendido</button>
    </dialog>
  </>;
}
