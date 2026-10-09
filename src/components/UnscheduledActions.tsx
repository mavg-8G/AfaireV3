"use client";
import { ActionButton } from "./ActionButton";
import { useI18n } from "./LocaleProvider";
import { displayTime } from "@/lib/locale";
import { resolveUnscheduled } from "@/app/actions/unscheduled";
import type { Unscheduled } from "@/lib/planner";

export function UnscheduledActions({ item, day, timezone, planVersion }: { item: Unscheduled; day: string; timezone: string; planVersion: number }) {
  const { t, preferences } = useI18n();
  return <div className="mt-2 flex flex-wrap gap-2">{item.actions?.map((action,index) => <ActionButton key={index} action={resolveUnscheduled.bind(null, day, item.key, index, planVersion)}>{action.type === "SPLIT" ? t(`Dividir · mínimo ${action.minChunk} min`) : action.type === "SHORTEN" ? t(`Acortar lo pendiente a ${action.durationMinutes} min`) : action.type === "MOVE_DEADLINE" ? t(`Mover fecha límite a ${action.date}`) : t(`Liberar «${action.title}» · ${displayTime(new Date(action.startsAt), timezone, preferences)}–${displayTime(new Date(action.endsAt), timezone, preferences)}`)}</ActionButton>)}</div>;
}
