import { feedbackPolicy } from "./plan-feedback";
import type { Prisma } from "../generated/prisma/client";
import { availabilityWindows } from "./availability";
import { startOfLocalWeek, addLocalDays, calendarDayBounds, dateOnly, roundUp, weekdayForDate, ymdInZone } from "./time";
import { computeGaps, type Gap } from "./scheduler";
export type CapacityDay = { day: string; minutes: number; maxGap: number; habitMinutes: number; freeGaps?: number[] };
export type LoadTask = { id: string; title: string; durationMinutes: number; availableFrom: string | null; dueDate: string | null; splittable?: boolean; minChunk?: number };
function fitsDay(day: CapacityDay, task: LoadTask) {
 if(day.maxGap>=task.durationMinutes)return true;
 if(!task.splittable || day.minutes<task.durationMinutes)return false;
 const minimum=task.minChunk??30;
 const gaps=(day.freeGaps??[]).filter(n=>n>=minimum).sort((a,b)=>b-a);
 let total=0;
 return gaps.some((gap,index)=>{total+=gap;return total>=task.durationMinutes&&(index+1)*minimum<=task.durationMinutes;});
}
export function analyzeLoad(days: CapacityDay[], tasks: LoadTask[], today: string) {
 const week = days.slice(0,7), end = week.at(-1)?.day ?? today;
 const relevant = tasks.filter(t => !t.availableFrom || t.availableFrom <= end);
 const taskMinutes = relevant.reduce((n,t)=>n+t.durationMinutes,0), habitMinutes = week.reduce((n,d)=>n+d.habitMinutes,0), freeMinutes=week.reduce((n,d)=>n+d.minutes,0);
 const risks = tasks.flatMap(task=>{
  if(!task.dueDate || task.dueDate > (days.at(-1)?.day ?? today))return [];
  const from = task.availableFrom && task.availableFrom > today ? task.availableFrom : today;
  const available = days.filter(d=>d.day>=from && d.day<=task.dueDate!);
  const capacity = available.reduce((n,d)=>n+Math.max(0,d.minutes-d.habitMinutes),0);
  const demand = tasks.filter(t=>t.dueDate && t.dueDate<=task.dueDate! && (!t.availableFrom || t.availableFrom>=from || from===today)).reduce((n,t)=>n+t.durationMinutes,0);
  const reason=task.dueDate<today?"La fecha límite ya pasó.":!available.some(d=>fitsDay(d,task))?task.splittable?"No hay huecos suficientes para los fragmentos antes del vencimiento.":"No hay un hueco continuo suficiente antes del vencimiento.":demand>capacity?"Las tareas que vencen antes de esta fecha superan la capacidad disponible.":null;
  return reason?[{id:task.id,title:task.title,dueDate:task.dueDate,reason}]:[];
 });
 return {taskMinutes,habitMinutes,freeMinutes,overloaded:taskMinutes+habitMinutes>freeMinutes,risks};
}
export async function capacityForecast(tx: Prisma.TransactionClient, userId: string, start: string, now = new Date()) {
 const user=await tx.user.findUniqueOrThrow({where:{id:userId},include:{availability:true}}), today=ymdInZone(now,user.timezone);
 const signal=feedbackPolicy(await tx.planFeedback.findMany({where:{userId,date:{gte:dateOnly(addLocalDays(today,-28)),lte:dateOnly(today)}}}));
 const effectiveSlack=Math.min(50,user.slackPercent+signal.extraSlack);
 const until=addLocalDays(start,27), bounds={start:calendarDayBounds(start,user.timezone).start,end:calendarDayBounds(until,user.timezone).end};
 const [overrides,events,tasks,habits,occurrences]=await Promise.all([
  tx.dayOverride.findMany({where:{userId,date:{gte:dateOnly(start),lte:dateOnly(until)}}}),
  tx.event.findMany({where:{userId,status:{notIn:["CANCELLED","SKIPPED"]},startsAt:{lt:new Date(bounds.end.getTime()+180*60000)},endsAt:{gt:new Date(bounds.start.getTime()-180*60000)}}}),
  tx.task.findMany({where:{userId,archived:false,status:{in:["INBOX","SCHEDULED"]}},include:{events:{where:{status:{in:["DONE","PENDING","IN_PROGRESS"]}}}}}),
  tx.habit.findMany({where:{userId,active:true,archived:false}}),
  tx.habitOccurrence.findMany({where:{userId,status:{in:["DONE","IN_PROGRESS"]},date:{gte:dateOnly(addLocalDays(start,-6)),lte:dateOnly(until)}}}),
 ]);
 const busy=events.filter(e=>e.locked || e.status!=="PENDING");
 const loadTasks=tasks.filter(t=>t.splittable || !busy.some(e=>e.taskId===t.id && e.startsAt<bounds.end)).map(t=>({id:t.id,title:t.title,splittable:t.splittable,minChunk:t.minChunk,durationMinutes:Math.max(0,t.durationMinutes-(t.splittable?t.events.filter(e=>e.status==="DONE"||e.locked||e.status==="IN_PROGRESS").reduce((n,e)=>n+(e.estimatedMinutes??(e.endsAt.getTime()-e.startsAt.getTime())/60000),0):0)),availableFrom:t.availableFrom?.toISOString().slice(0,10)??null,dueDate:t.dueDate?.toISOString().slice(0,10)??null})).filter(t=>t.durationMinutes>0);
 const days:CapacityDay[]=[];
 for(let day=start;day<=until;day=addLocalDays(day,1)) {
  const override=overrides.find(o=>o.date.getTime()===dateOnly(day).getTime());let gaps: Gap[];
  try {gaps=availabilityWindows(user,day,user.timezone,override).flatMap(w=>computeGaps(new Date(Math.max(w.start.getTime(),roundUp(now).getTime())),w.end,busy,user.bufferMinutes));} catch {gaps=[];}
  const minutes=gaps.reduce((n,g)=>n+(g.end.getTime()-g.start.getTime())/60000,0)*(1-effectiveSlack/100)*(override?.capacityPercent??100)/100;
  let habitMinutes=0;
  for(const habit of habits){
   if(override?.paused || (override?.essentialOnly&&!habit.required))continue;
   const already=occurrences.some(o=>o.habitId===habit.id && o.date.getTime()===dateOnly(day).getTime()) || busy.some(e=>e.habitId===habit.id && e.planningDate?.getTime()===dateOnly(day).getTime());
   if(already)continue;
   if(habit.frequencyMode==="DAYS" && habit.daysOfWeek.includes(weekdayForDate(day)))habitMinutes+=habit.durationMinutes+user.bufferMinutes;

  }
  days.push({day,minutes,freeGaps:gaps.map(g=>(g.end.getTime()-g.start.getTime())/60000),maxGap:Math.min(minutes,Math.max(0,...gaps.map(g=>(g.end.getTime()-g.start.getTime())/60000))),habitMinutes:day<today?0:habitMinutes});
 }
 for(const habit of habits.filter(h=>h.frequencyMode === "WEEKLY")) {
  const weeks = [...new Set(days.map(d=>startOfLocalWeek(d.day, user.weekStartsOn)))];
  for(const monday of weeks) {
   const sunday=addLocalDays(monday,6);
   const completed=new Set([...occurrences.filter(o=>o.habitId===habit.id&&o.date>=dateOnly(monday)&&o.date<=dateOnly(sunday)).map(o=>o.date.toISOString().slice(0,10)),...busy.filter(e=>e.habitId===habit.id&&e.planningDate&&e.planningDate>=dateOnly(monday)&&e.planningDate<=dateOnly(sunday)).map(e=>e.planningDate!.toISOString().slice(0,10))]).size;
   const candidates=days.filter(d=>d.day>=today&&d.day>=monday&&d.day<=sunday&&d.minutes>0&&!overrides.some(o=>o.date.getTime()===dateOnly(d.day).getTime()&&(o.paused||(o.essentialOnly&&!habit.required))));
   const fallback=days.find(d=>d.day>=today&&d.day>=monday&&d.day<=sunday&&!overrides.some(o=>o.date.getTime()===dateOnly(d.day).getTime()&&(o.paused||(o.essentialOnly&&!habit.required))));
   const load=Math.max(0,habit.weeklyTarget-completed)*(habit.durationMinutes+user.bufferMinutes);
   if(candidates.length) for(const candidate of candidates) candidate.habitMinutes+=load/candidates.length;
   else if(fallback) fallback.habitMinutes+=load;
  }
 }
 return analyzeLoad(days,loadTasks,today);
}
