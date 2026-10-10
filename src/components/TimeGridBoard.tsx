"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { displayClock } from "@/lib/locale";
import { moveEvent } from "@/app/actions/events";
import { GRID_STEP, clampStart, minuteHm, snapMinute, type GridDay, type GridItem } from "@/lib/time-grid";

type Slot = { day: number; start: number };
type Gesture = { item: GridItem; pointerId: number; x: number; y: number; grab: number; active: boolean; touch: boolean; timer?: ReturnType<typeof setTimeout>; target: Slot };
const noop = () => () => {};
export function TimeGridBoard({ days, items, windows, range, nowDay, css, nonce }: { days: GridDay[]; items: GridItem[]; windows: { cls: string; day: number }[]; range: { start: number; end: number }; nowDay: number | null; css: string; nonce?: string }) {
  const { t, preferences } = useI18n(); const router = useRouter();
  const [drag, setDrag] = useState<(Slot & { id: string; keys: boolean }) | null>(null);
  const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  const root = useRef<HTMLDivElement>(null); const scroller = useRef<HTMLDivElement>(null); const columns = useRef<(HTMLDivElement | null)[]>([]);
  const gesture = useRef<Gesture | null>(null); const suppressClick = useRef(false); const refocus = useRef<string | null>(null);
  const span = range.end - range.start; const single = days.length === 1;
  const dragged = drag ? items.find(item => item.id === drag.id && item.movable) : undefined;
  const clock = (minute: number) => displayClock(minuteHm(minute), preferences);
  const hours = Array.from({ length: span / 60 }, (_, index) => range.start + index * 60);
  // The CSP forbids style attributes and only honours the nonce of the document's own request. The first paint uses
  // a nonce stylesheet; once mounted, and after every refresh or client navigation, positions come from the CSSOM.
  const firstPaint = useSyncExternalStore(noop, () => false, () => true);
  useLayoutEffect(() => {
    if (typeof CSSStyleSheet === "undefined" || !("adoptedStyleSheets" in document)) return;
    const sheet = new CSSStyleSheet(); sheet.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    return () => { document.adoptedStyleSheets = document.adoptedStyleSheets.filter(value => value !== sheet); };
  }, [css]);
  useLayoutEffect(() => {
    if (!drag || !dragged || typeof CSSStyleSheet === "undefined" || !("adoptedStyleSheets" in document)) return;
    const top = ((drag.start - range.start) / span) * 100;
    const height = ((dragged.end - dragged.start) / span) * 100;
    const sheet = new CSSStyleSheet(); sheet.replaceSync(`.tg-preview{top:${top}%;height:${height}%}`);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    return () => { document.adoptedStyleSheets = document.adoptedStyleSheets.filter(value => value !== sheet); };
  }, [drag, dragged, range.start, span]);
  // On narrow screens the week scrolls sideways; start with today in view.
  useEffect(() => {
    const column = columns.current[days.findIndex(day => day.isToday)]; const first = columns.current[0];
    if (column && first && scroller.current) scroller.current.scrollLeft = column.offsetLeft - first.offsetLeft;
  }, [days]);
  // A block moved with the keyboard is rendered again in its new column; give it the focus back.
  useEffect(() => {
    if (pending || !refocus.current) return;
    root.current?.querySelector<HTMLElement>(`[data-event="${CSS.escape(refocus.current)}"]`)?.focus(); refocus.current = null;
  }, [items, pending]);
  // A long press starts a touch drag; from then on the page must not scroll under the finger.
  useEffect(() => {
    const node = root.current; if (!node) return;
    const block = (event: TouchEvent) => { if (gesture.current?.active) event.preventDefault(); };
    node.addEventListener("touchmove", block, { passive: false });
    return () => node.removeEventListener("touchmove", block);
  }, []);
  function slotAt(x: number, y: number, current: Gesture): Slot {
    let day = current.item.day;
    if (!current.item.dayLocked) {
      const hit = columns.current.findIndex(column => { const rect = column?.getBoundingClientRect(); return rect && x >= rect.left && x < rect.right; });
      if (hit >= 0) day = hit; else { const first = columns.current[0]?.getBoundingClientRect(); day = first && x < first.left ? 0 : days.length - 1; }
    }
    const rect = columns.current[day]!.getBoundingClientRect();
    return { day, start: clampStart(snapMinute(range.start + ((y - rect.top) / rect.height) * span - current.grab), current.item.end - current.item.start, range) };
  }
  function commit(item: GridItem, target: Slot) {
    if (target.day === item.day && target.start === item.start) { setDrag(null); return; }
    setError("");
    startTransition(async () => {
      let message = "";
      try { message = (await moveEvent(item.id, days[target.day].date, minuteHm(target.start))).error ?? ""; } catch { message = "No se pudo cambiar el horario."; }
      // The preview stays in place until the refreshed agenda arrives.
      startTransition(() => { if (message) setError(message); else router.refresh(); setDrag(null); });
    });
  }
  function cancelGesture() { clearTimeout(gesture.current?.timer); gesture.current = null; setDrag(null); }
  function keyMove(event: React.KeyboardEvent, item: GridItem) {
    if (!item.movable || pending) return;
    const current = drag?.keys && drag.id === item.id ? drag : null; const base = current ?? { day: item.day, start: item.start };
    const step = event.shiftKey ? 60 : GRID_STEP; let next: Slot | null = null;
    if (event.key === "ArrowUp") next = { day: base.day, start: base.start - step };
    else if (event.key === "ArrowDown") next = { day: base.day, start: base.start + step };
    else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !single && !item.dayLocked) next = { day: Math.max(0, Math.min(days.length - 1, base.day + (event.key === "ArrowLeft" ? -1 : 1))), start: base.start };
    else if (event.key === "Enter" && current) { event.preventDefault(); refocus.current = item.id; commit(item, current); return; }
    else if (event.key === "Escape" && current) { event.preventDefault(); setDrag(null); return; }
    if (!next) return;
    event.preventDefault();
    setDrag({ id: item.id, keys: true, day: next.day, start: clampStart(next.start, item.end - item.start, range) });
  }
  return <div ref={root} className="space-y-3">
    {firstPaint && <style nonce={nonce} dangerouslySetInnerHTML={{ __html: css }} />}
    {error && <p role="alert" className="rounded-xl border border-terracotta/40 bg-card px-4 py-3 text-sm text-terracotta">{t(error)}</p>}
    <p role="status" aria-live="polite" className="sr-only">{drag?.keys && dragged ? t(`Mover «${dragged.title}» a ${days[drag.day].longLabel}, ${clock(drag.start)}. Enter confirma, Escape cancela.`) : pending ? t("Guardando…") : ""}</p>
    <div ref={scroller} className="overflow-x-auto rounded-2xl border border-line bg-card shadow-sm">
      <div aria-busy={pending} className={`grid ${single ? "grid-cols-[3.25rem_minmax(0,1fr)]" : "min-w-[52rem] grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]"}`}>
        {!single && <><div className="border-b border-line" />{days.map(day => <Link key={day.date} href={`/?date=${day.date}`} title={day.longLabel} className={`border-b border-l border-line px-2 py-2.5 text-center text-sm font-semibold capitalize transition hover:bg-sunken ${day.isToday ? "bg-sage-soft text-sage" : "text-muted"}`}>{day.label}{day.isToday && <span className="sr-only">{t(" · hoy")}</span>}</Link>)}</>}
        <div className="tg-body flex flex-col" aria-hidden="true">{hours.map(hour => <div key={hour} className="flex-1 pr-2 text-right text-[11px] tabular-nums text-muted"><span className="relative -top-2">{hour === range.start ? "" : clock(hour)}</span></div>)}</div>
        {days.map((day, index) => <div key={day.date} ref={node => { columns.current[index] = node; }} role="group" aria-label={day.longLabel} className="tg-body relative border-l border-line bg-sunken/70">
          {windows.filter(window => window.day === index).map(window => <div key={window.cls} aria-hidden="true" className={`${window.cls} absolute inset-x-0 bg-card`} />)}
          <div aria-hidden="true" className="absolute inset-0 flex flex-col">{hours.map(hour => <div key={hour} className="flex-1 border-t border-line/70" />)}</div>
          {nowDay === index && <div aria-hidden="true" className="tg-now pointer-events-none absolute inset-x-0 z-10 border-t-2 border-terracotta" />}
          {items.filter(item => item.day === index).map(item => {
            const moving = drag?.id === item.id;
            return <button key={item.cls} type="button" data-event={item.id} aria-disabled={pending && moving ? true : undefined}
              aria-label={`${item.title}, ${clock(item.start)}–${clock(item.end)}, ${t(item.locked ? "Fijo" : "Flexible")}${item.done ? `, ${t("Completado ✓")}` : ""}${item.movable ? `. ${t("Flechas para mover, Enter para abrir.")}` : ""}`}
              className={`${item.cls} absolute inset-x-0.5 z-[5] flex min-h-0 select-none flex-col items-stretch justify-start overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm [-webkit-touch-callout:none] ${item.locked ? "border-fixed bg-fixed-soft" : "border-sage bg-sage-soft"} ${item.active ? "ring-1 ring-sage" : ""} ${item.done ? "opacity-60" : ""} ${moving ? "opacity-40" : ""} ${item.movable ? "cursor-grab active:cursor-grabbing" : ""}`}
              onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } router.push(`/?date=${day.date}#event-${item.id}`); }}
              onKeyDown={event => keyMove(event, item)} onBlur={() => { if (drag?.keys && !pending) setDrag(null); }}
              onContextMenu={event => { if (gesture.current?.touch) event.preventDefault(); }}
              onPointerDown={event => {
                if (!item.movable || pending || event.button !== 0) return;
                const rect = columns.current[index]!.getBoundingClientRect(); const touch = event.pointerType === "touch";
                const current: Gesture = { item, pointerId: event.pointerId, x: event.clientX, y: event.clientY, grab: range.start + ((event.clientY - rect.top) / rect.height) * span - item.start, active: false, touch, target: { day: item.day, start: item.start } };
                if (touch) current.timer = setTimeout(() => { current.active = true; setDrag({ id: item.id, keys: false, ...current.target }); }, 350);
                else event.currentTarget.setPointerCapture(event.pointerId);
                gesture.current = current;
              }}
              onPointerMove={event => {
                const current = gesture.current; if (!current || current.pointerId !== event.pointerId) return;
                const distance = Math.hypot(event.clientX - current.x, event.clientY - current.y);
                if (!current.active) { if (current.touch) { if (distance > 10) cancelGesture(); return; } if (distance < 5) return; current.active = true; }
                current.target = slotAt(event.clientX, event.clientY, current); setDrag({ id: item.id, keys: false, ...current.target });
              }}
              onPointerUp={event => {
                const current = gesture.current; if (!current || current.pointerId !== event.pointerId) return;
                clearTimeout(current.timer); gesture.current = null;
                if (!current.active) return;
                suppressClick.current = true; setTimeout(() => { suppressClick.current = false; }, 0);
                commit(item, current.target);
              }}
              onPointerCancel={cancelGesture}>
              <span className="block truncate font-semibold">{item.title}{item.done ? " ✓" : ""}</span>
              {item.end - item.start >= 30 && <span className="block truncate tabular-nums text-muted">{clock(item.start)}–{clock(item.end)}</span>}
            </button>;
          })}
          {drag && dragged && drag.day === index && <div aria-hidden="true" className="tg-preview pointer-events-none absolute inset-x-0.5 z-20 overflow-hidden rounded-md border-2 border-dashed border-sage bg-sage-soft/90 px-1.5 py-0.5 text-[11px] font-semibold leading-tight tabular-nums text-sage shadow-md">{clock(drag.start)}–{clock(drag.start + dragged.end - dragged.start)}</div>}
        </div>)}
      </div>
    </div>
    <p className="px-1 text-xs leading-relaxed text-muted">{t("Arrastra un bloque pendiente para moverlo; en pantallas táctiles, mantenlo pulsado antes de arrastrar. Con teclado: flechas para elegir el horario (Mayús mueve una hora), Enter para confirmar y Escape para cancelar. El bloque movido queda fijo.")}</p>
  </div>;
}
