import { createHash } from "node:crypto";
import { Prisma, type Event } from "@prisma/client";
import { dateOnly } from "./time";
import { DomainError, withUserLock } from "./transaction";

export function jsonValue(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)); }
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,v]) => [key,canonical(v)]));
  return value;
}
export function stateHash(value: unknown) { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
export async function captureAgenda(tx: Prisma.TransactionClient, userId: string, day: string) {
  const [events, tasks, occurrences, plan, override, rules, availability, categories, feedback, habits, series, overrides] = await Promise.all([
    tx.event.findMany({ where: { userId }, orderBy: { id: "asc" } }),
    tx.task.findMany({ where: { userId }, orderBy: { id: "asc" } }),
    tx.habitOccurrence.findMany({ where: { userId }, orderBy: { id: "asc" } }),
    tx.dayPlan.findUnique({ where: { userId_date: { userId, date: dateOnly(day) } } }),
    tx.dayOverride.findUnique({ where: { userId_date: { userId, date: dateOnly(day) } } }),
    tx.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true, updatedAt: true, weekStartsOn: true } }),
    tx.availability.findMany({ where: { userId }, orderBy: { id: "asc" } }),
    tx.categoryBudget.findMany({ where: { userId }, orderBy: { id: "asc" } }),
    tx.planFeedback.findMany({ where: { userId }, orderBy: { id: "asc" } }),
    tx.habit.findMany({ where: { userId }, orderBy: { id: "asc" } }),
    tx.taskSeries.findMany({ where: { userId }, orderBy: { id: "asc" } }),
    tx.dayOverride.findMany({ where: { userId }, orderBy: { id: "asc" } }),
  ]);
  return { events, tasks, occurrences, plan, override, rules, availability, categories, feedback, habits, series, overrides };
}
export type AgendaSnapshot = Awaited<ReturnType<typeof captureAgenda>>;
type StoredSnapshot = Pick<AgendaSnapshot,"events"|"tasks"|"plan"|"override"> & { fingerprint?: string };
export function revisionFingerprint(value: Prisma.JsonValue) { return value && typeof value === "object" && !Array.isArray(value) && typeof value.fingerprint === "string" ? value.fingerprint : stateHash(value); }
export async function saveRevision(tx: Prisma.TransactionClient, userId: string, day: string, before: AgendaSnapshot, kind: string, now: Date) {
  const after = await captureAgenda(tx, userId, day);
  const eventChanges = changedEvents(before, after);
  const taskIds = new Set([...before.tasks, ...after.tasks].map(t => t.id).filter(id => stateHash(before.tasks.find(t => t.id === id) ?? null) !== stateHash(after.tasks.find(t => t.id === id) ?? null)));
  const compact = (snapshot: AgendaSnapshot, events: Event[]) => ({ events, tasks: snapshot.tasks.filter(t => taskIds.has(t.id)), plan: snapshot.plan, override: snapshot.override });
  const previous = await tx.planRevision.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const createdAt = new Date(Math.max(now.getTime(), (previous?.createdAt.getTime() ?? 0) + 1));
  await tx.planRevision.create({ data: { userId, date: dateOnly(day), before: jsonValue(compact(before,eventChanges.before)), after: jsonValue({ ...compact(after,eventChanges.after), fingerprint: stateHash(after) }), kind, createdAt } });
  const old = await tx.planRevision.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: 30, select: { id: true } });
  if (old.length) await tx.planRevision.deleteMany({ where: { userId, id: { in: old.map(row => row.id) } } });
}
function hydrate<T>(value: Prisma.JsonValue): T { return JSON.parse(JSON.stringify(value), (key, v) => typeof v === "string" && /^(startsAt|endsAt|planningDate|date|createdAt|updatedAt|generatedAt|startedAt|postponedAt|availableFrom|dueDate|periodStart|learnedAt|anchorDate)$/.test(key) ? new Date(v) : v); }
export function changedEvents(before: Pick<AgendaSnapshot,"events">, after: Pick<AgendaSnapshot,"events">) {
  const a = new Map(before.events.map(e => [e.id, e])), b = new Map(after.events.map(e => [e.id, e]));
  const ids = [...new Set([...a.keys(), ...b.keys()])].filter(id => stateHash(a.get(id) ?? null) !== stateHash(b.get(id) ?? null));
  return { ids, before: ids.flatMap(id => a.get(id) ? [a.get(id)!] : []), after: ids.flatMap(id => b.get(id) ? [b.get(id)!] : []) };
}
function restorable(events: Event[], now: Date) { return events.every(e => e.source !== "MANUAL" && !e.locked && e.status === "PENDING" && e.startsAt >= now); }
export async function undoPlan(userId: string, revisionId: string, now = new Date()) {
  return withUserLock(userId, async tx => {
    const revision = await tx.planRevision.findFirst({ where: { id: revisionId, userId } });
    if (!revision || revision.undoneAt || revision.kind === "UNDO") throw new DomainError("Este cambio ya no se puede deshacer.");
    const latest = await tx.planRevision.findFirst({ where: { userId, date: revision.date }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    if (latest?.id !== revision.id) throw new DomainError("Solo puedes deshacer el último plan de esta fecha.");
    const day = revision.date.toISOString().slice(0, 10), before = hydrate<StoredSnapshot>(revision.before), after = hydrate<StoredSnapshot>(revision.after);
    const current = await captureAgenda(tx, userId, day);
    if (stateHash(current) !== revisionFingerprint(revision.after)) throw new DomainError("La agenda cambió después de este plan. No se ha restaurado nada.");
    const changes = changedEvents(before, after);
    if (!restorable([...changes.before, ...changes.after], now)) throw new DomainError("Un bloque afectado ya empezó, terminó o quedó fijado. No se ha restaurado nada.");
    await tx.event.deleteMany({ where: { userId, id: { in: changes.ids } } });
    for (const event of changes.before) await tx.event.create({ data: event });
    for (const task of before.tasks) {
      const later = after.tasks.find(t => t.id === task.id);
      if (later && stateHash(task) !== stateHash(later)) await tx.task.update({ where: { id: task.id }, data: { status: task.status, availableFrom: task.availableFrom, postponements: task.postponements, handledPostponements: task.handledPostponements, updatedAt: task.updatedAt } });
    }
    for (const task of after.tasks.filter(t => !before.tasks.some(old => old.id === t.id))) {
      if (!await tx.event.count({ where: { userId, taskId: task.id, status: { in: ["PENDING", "IN_PROGRESS", "DONE"] } } })) await tx.task.update({ where: { id: task.id }, data: { status: "INBOX" } });
    }
    if (before.override) await tx.dayOverride.upsert({ where: { userId_date: { userId, date: revision.date } }, create: before.override, update: { label: before.override.label, paused: before.override.paused, startTime: before.override.startTime, endTime: before.override.endTime, capacityPercent: before.override.capacityPercent, essentialOnly: before.override.essentialOnly } });
    else await tx.dayOverride.deleteMany({ where: { userId, date: revision.date } });
    if (before.plan) await tx.dayPlan.update({ where: { userId_date: { userId, date: revision.date } }, data: { skipped: before.plan.skipped, details: before.plan.details ?? [], generatedAt: now, version: { increment: 1 } } });
    else await tx.dayPlan.deleteMany({ where: { userId, date: revision.date } });
    await tx.planRevision.update({ where: { id: revision.id }, data: { undoneAt: now } });
    await saveRevision(tx, userId, day, current, "UNDO", now);
    return { ok: true };
  });
}
export function revisionSummary(beforeValue: Prisma.JsonValue, afterValue: Prisma.JsonValue, now: Date) {
  const before = hydrate<StoredSnapshot>(beforeValue), after = hydrate<StoredSnapshot>(afterValue), changes = changedEvents(before, after);
  return { removed: changes.before.length, added: changes.after.length, restorable: restorable([...changes.before, ...changes.after], now) };
}

export function revisionTimeline(beforeValue: Prisma.JsonValue, afterValue: Prisma.JsonValue) {
  const changes = changedEvents(hydrate<StoredSnapshot>(beforeValue), hydrate<StoredSnapshot>(afterValue));
  return { before: changes.before.sort((a,b) => a.startsAt.getTime() - b.startsAt.getTime()), after: changes.after.sort((a,b) => a.startsAt.getTime() - b.startsAt.getTime()) };
}
