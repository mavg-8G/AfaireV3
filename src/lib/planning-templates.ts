import { translator } from "./locale";
import type { Prisma } from "@prisma/client";
import { TASK_BUNDLES, WEEK_TEMPLATES } from "./templates";
import { addLocalDays, dateOnly, weekdayForDate, ymdInZone } from "./time";
import { DateSchema } from "./definitions";
import { DomainError } from "./transaction";
import { clearFlexiblePlans } from "./exceptions";
export async function createBundleTasks(tx: Prisma.TransactionClient, userId: string, key: string, date: string) {
 const user=await tx.user.findUniqueOrThrow({where:{id:userId}}); const translate=translator(user.locale);
 DateSchema.parse(date);const bundle=TASK_BUNDLES.find(t=>t.key===key);if(!bundle)throw new DomainError("Plantilla no encontrada.");
 const previous=await tx.templateUse.findUnique({where:{userId_key_date:{userId,key:bundle.key,date:dateOnly(date)}}});if(previous)throw new DomainError("Esta plantilla ya se aplicó para esa fecha.");
 await tx.templateUse.create({data:{userId,key:bundle.key,date:dateOnly(date)}});
 await tx.task.createMany({data:bundle.tasks.map(t=>({userId,title:translate(t.title),durationMinutes:t.minutes,priority:t.priority,dueDate:dateOnly(addLocalDays(date,t.offset)),energy:t.energy}))});
}
export async function createTemplateWeek(tx: Prisma.TransactionClient,userId:string,key:string,date:string,now=new Date()) {
 DateSchema.parse(date); const user=await tx.user.findUniqueOrThrow({where:{id:userId}}); const template=WEEK_TEMPLATES.find(t=>t.key===key);if(!template||weekdayForDate(date)!==user.weekStartsOn)throw new DomainError("Elige el primer día de tu semana y una plantilla.");
 if(date<ymdInZone(now,user.timezone))throw new DomainError("Elige una semana futura para aplicar los siete días.");
 for(let i=0;i<7;i++){const day=addLocalDays(date,i),paused=[0,6].includes(weekdayForDate(day)),data={label:translator(user.locale)(template.title),paused,startTime:paused?null:template.start,endTime:paused?null:template.end,capacityPercent:100,essentialOnly:false};await tx.dayOverride.upsert({where:{userId_date:{userId,date:dateOnly(day)}},create:{...data,userId,date:dateOnly(day)},update:data});}
 await clearFlexiblePlans(tx,userId,date,addLocalDays(date,6),user.timezone,now);
}
export async function stopTaskSeries(tx:Prisma.TransactionClient,userId:string,id:string,now=new Date()) {
 const user=await tx.user.findUniqueOrThrow({where:{id:userId}}),series=await tx.taskSeries.findFirst({where:{id,userId}});if(!series)throw new DomainError("Repetición no encontrada.");
 await tx.taskSeries.update({where:{id},data:{active:false}});
 const tasks=await tx.task.findMany({where:{userId,seriesId:id,availableFrom:{gt:dateOnly(ymdInZone(now,user.timezone))},status:{in:["INBOX","SCHEDULED"]},archived:false,events:{none:{OR:[{status:{in:["DONE","IN_PROGRESS"]}},{locked:true,status:"PENDING"}]}}}});
 await tx.event.updateMany({where:{userId,taskId:{in:tasks.map(t=>t.id)},status:"PENDING",locked:false},data:{status:"CANCELLED"}});
 await tx.task.updateMany({where:{userId,id:{in:tasks.map(t=>t.id)}},data:{archived:true,status:"CANCELLED"}});
}
