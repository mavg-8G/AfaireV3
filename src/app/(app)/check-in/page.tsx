import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { DateSchema } from "@/lib/definitions";
import { addLocalDays, calendarDayBounds, dateOnly, ymdInZone } from "@/lib/time";
import { displayDay, translator } from "@/lib/locale";
import { getRequestPreferences } from "@/lib/request-preferences";
import { DayCheckInForm } from "@/components/DayCheckInForm";
export default async function CheckInPage({searchParams}:{searchParams:Promise<{date?:string}>}) {
  const user=await requireUser(),preferences=await getRequestPreferences(),t=translator(preferences.locale),params=await searchParams;
  const today=ymdInZone(new Date(),user.timezone),parsed=DateSchema.safeParse(params.date??today);if(!parsed.success||parsed.data>today||parsed.data<addLocalDays(today,-28))notFound();
  const day=parsed.data,bounds=calendarDayBounds(day,user.timezone);
  const [events,saved,done]=await Promise.all([
    prisma.event.findMany({where:{userId:user.id,status:{in:["PENDING","IN_PROGRESS"]},startsAt:{lt:bounds.end},endsAt:{gt:bounds.start}},orderBy:{startsAt:"asc"}}),
    prisma.dayCheckIn.findUnique({where:{userId_date:{userId:user.id,date:dateOnly(day)}}}),
    prisma.event.count({where:{userId:user.id,status:"DONE",startsAt:{lt:bounds.end},endsAt:{gt:bounds.start}}}),
  ]);
  return <div className="mx-auto max-w-4xl space-y-6"><Link href={`/?date=${day}`} className="text-sm text-sage">{t("Volver a la agenda")}</Link><div><p className="eyebrow">{displayDay(day,user.timezone,preferences)}</p><h1 className="mt-2 text-[2.5rem] sm:text-5xl">{t("¿Qué pasó hoy?")}</h1><p className="mt-3 text-sm text-muted">{t(`${done} bloques hechos y ${events.length} por resolver`)}</p><p className="mt-2 text-xs text-muted">{t("Resuelve varios pendientes con un solo guardado. Las decisiones se aplican juntas; si un bloque cambió mientras revisabas, podrás actualizar antes de guardar.")}</p></div><DayCheckInForm day={day} timezone={user.timezone} saved={saved?{mood:saved.mood,note:saved.note}:null} events={events.map(event=>({id:event.id,title:event.title,startsAt:event.startsAt.toISOString(),endsAt:event.endsAt.toISOString(),updatedAt:event.updatedAt.toISOString(),taskId:event.taskId}))} /></div>;
}
