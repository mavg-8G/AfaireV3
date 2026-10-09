import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { withUserLock } from "../../src/lib/transaction";
import { generateDay, runDuePlans } from "../../src/lib/planner";
import { applyException } from "../../src/lib/exceptions";
import { materializeTaskSeries } from "../../src/lib/task-series";
import { capacityForecast } from "../../src/lib/capacity";
import { dateOnly } from "../../src/lib/time";
const ids:string[]=[], day="2030-04-15", now=new Date("2030-04-14T20:00Z");
async function account(){const u=await prisma.user.create({data:{email:randomUUID()+"@test.invalid",name:"Capacity",passwordHash:"unused",timezone:"UTC",dayStart:"08:00",dayEnd:"12:00",bufferMinutes:10,onboardingCompleted:true}});ids.push(u.id);return u;}
after(async()=>{for(const userId of ids){await prisma.event.deleteMany({where:{userId}});await prisma.habitOccurrence.deleteMany({where:{userId}});await prisma.task.deleteMany({where:{userId}});await prisma.user.delete({where:{id:userId}});}await prisma.$disconnect();});
test("reduced days preserve fixed and completed blocks and defer nonurgent work",async()=>{
 const u=await account();await prisma.event.create({data:{userId:u.id,title:"Keep",startsAt:new Date(day+"T08:00Z"),endsAt:new Date(day+"T08:30Z")}});
 const urgent=await prisma.task.create({data:{userId:u.id,title:"Urgent",durationMinutes:30,dueDate:dateOnly(day)}}), optional=await prisma.task.create({data:{userId:u.id,title:"Optional",durationMinutes:30}});
 await generateDay(u.id,day,{now});
 const optionalBlock=await prisma.event.findFirstOrThrow({where:{taskId:optional.id}});
 await prisma.event.update({where:{id:optionalBlock.id},data:{status:"DONE"}});await prisma.task.update({where:{id:optional.id},data:{status:"DONE"}});
 const later=await prisma.task.create({data:{userId:u.id,title:"Not urgent",durationMinutes:30}});
 await generateDay(u.id,day,{now,dayMode:"DIFFICULT"});
 assert.equal((await prisma.event.findUniqueOrThrow({where:{id:optionalBlock.id}})).status,"DONE");
 assert.equal(await prisma.event.count({where:{userId:u.id,title:"Keep"}}),1);
 assert.equal(await prisma.event.count({where:{taskId:urgent.id,status:"PENDING"}}),1);assert.equal(await prisma.event.count({where:{taskId:later.id}}),0);
 assert.equal((await prisma.dayOverride.findUniqueOrThrow({where:{userId_date:{userId:u.id,date:dateOnly(day)}}})).capacityPercent,30);
 const plan=await prisma.dayPlan.findFirstOrThrow({where:{userId:u.id}});assert.match(JSON.stringify(plan.details),/día difícil/);
});
test("holgura and recovery are enforced together and remain stable across replanning",async()=>{
 const u=await account();await prisma.user.update({where:{id:u.id},data:{slackPercent:20,longBlockMinutes:90,recoveryMinutes:20}});
 await prisma.task.createMany({data:[{userId:u.id,title:"Long",durationMinutes:90,priority:1},{userId:u.id,title:"One",durationMinutes:60},{userId:u.id,title:"Two",durationMinutes:60}]});
 await generateDay(u.id,day,{now});const first=await prisma.event.findMany({where:{userId:u.id},orderBy:{startsAt:"asc"}});
 assert.equal(first.length,2);assert.equal(first.find(e=>e.title==="Long")!.recoveryMinutes,20);
 await generateDay(u.id,day,{now});const second=await prisma.event.findMany({where:{userId:u.id},orderBy:{startsAt:"asc"}});assert.deepEqual(second.map(e=>[e.title,e.startsAt.toISOString()]),first.map(e=>[e.title,e.startsAt.toISOString()]));
});
test("vacations and temporary hours never rewrite base availability and worker skips paused days",async()=>{
 const u=await account();await prisma.user.update({where:{id:u.id},data:{autoPlan:true}});await prisma.task.create({data:{userId:u.id,title:"Task",durationMinutes:30}});
 await generateDay(u.id,day,{now});
 await withUserLock(u.id,tx=>applyException(tx,u.id,{start:day,until:day,label:"Holiday",mode:"PAUSE",startTime:"09:00",endTime:"13:00"},now));
 assert.equal(await prisma.event.count({where:{userId:u.id}}),0);assert.equal((await runDuePlans(new Date(day+"T09:00Z"),{userIds:[u.id]})).generated,0);
 assert.equal((await generateDay(u.id,day,{now})).placed,0);
 await withUserLock(u.id,tx=>applyException(tx,u.id,{start:day,until:day,label:"Short hours",mode:"HOURS",startTime:"14:00",endTime:"15:00"},now));
 assert.equal((await runDuePlans(new Date(day+"T14:00Z"),{userIds:[u.id]})).generated,1);
 await generateDay(u.id,day,{now});assert.equal((await prisma.event.findFirstOrThrow({where:{userId:u.id}})).startsAt.toISOString(),day+"T14:00:00.000Z");
 assert.equal((await prisma.user.findUniqueOrThrow({where:{id:u.id}})).dayStart,"08:00");
});
test("flexible task materialization is idempotent and prevents scheduling before opening",async()=>{
 const u=await account();const series=await prisma.taskSeries.create({data:{userId:u.id,title:"Backups",durationMinutes:30,frequency:"WEEKLY",anchorDate:dateOnly("2030-04-19"),windowDays:3}});
 await Promise.all([withUserLock(u.id,tx=>materializeTaskSeries(tx,u.id,day,"2030-04-30")),withUserLock(u.id,tx=>materializeTaskSeries(tx,u.id,day,"2030-04-30"))]);
 assert.equal(await prisma.task.count({where:{seriesId:series.id}}),2);
 await generateDay(u.id,day,{now});assert.equal(await prisma.event.count({where:{userId:u.id}}),0);
 await generateDay(u.id,"2030-04-19",{now});assert.equal(await prisma.event.count({where:{userId:u.id}}),1);
 await generateDay(u.id,"2030-04-19",{now});assert.equal(await prisma.event.count({where:{userId:u.id}}),1);
});
test("frequency habits pick roomy days and never exceed weekly quota",async()=>{
 const u=await account();const habit=await prisma.habit.create({data:{userId:u.id,title:"Exercise",durationMinutes:30,daysOfWeek:[],frequencyMode:"WEEKLY",weeklyTarget:3,createdAt:now}});
 for(const d of ["2030-04-15","2030-04-16","2030-04-17"]){await generateDay(u.id,d,{now});}
 assert.equal(await prisma.event.count({where:{habitId:habit.id}}),3);
 await generateDay(u.id,"2030-04-18",{now});assert.equal(await prisma.event.count({where:{habitId:habit.id}}),3);
 await generateDay(u.id,"2030-04-17",{now});assert.equal(await prisma.event.count({where:{habitId:habit.id}}),3);
 const other=await account();const roomy=await prisma.habit.create({data:{userId:other.id,title:"Once",durationMinutes:30,daysOfWeek:[],frequencyMode:"WEEKLY",weeklyTarget:1}});
 await prisma.dayOverride.create({data:{userId:other.id,date:dateOnly("2030-04-16"),startTime:"08:00",endTime:"18:00"}});
 await generateDay(other.id,day,{now});assert.equal(await prisma.event.count({where:{habitId:roomy.id}}),0);
 await generateDay(other.id,"2030-04-16",{now});assert.equal(await prisma.event.count({where:{habitId:roomy.id}}),1);
});
test("forecast exposes workload and deadline risk before any day is generated",async()=>{
 const u=await account();await prisma.task.createMany({data:Array.from({length:5},(_,i)=>({userId:u.id,title:`Big ${i}`,durationMinutes:480,dueDate:dateOnly(day)}))});
 const result=await capacityForecast(prisma,u.id,day,now);assert.equal(result.overloaded,true);assert.equal(result.risks.length,5);assert.equal(result.taskMinutes,2400);assert.equal(await prisma.dayPlan.count({where:{userId:u.id}}),0);
 const other=await account();await assert.rejects(prisma.task.create({data:{userId:other.id,title:"Foreign",durationMinutes:30,seriesId:(await prisma.taskSeries.create({data:{userId:u.id,title:"Owned",durationMinutes:30,frequency:"WEEKLY",anchorDate:dateOnly(day),windowDays:3}})).id,periodStart:dateOnly(day),availableFrom:dateOnly(day),dueDate:dateOnly(day)}}));
});

test("task bundles are reusable by date and a week template preserves fixed history and base settings",async()=>{
 const {createBundleTasks,createTemplateWeek}=await import("../../src/lib/planning-templates");const u=await account();
 await withUserLock(u.id,tx=>createBundleTasks(tx,u.id,"trip","2030-05-01"));assert.equal(await prisma.task.count({where:{userId:u.id}}),3);
 await assert.rejects(withUserLock(u.id,tx=>createBundleTasks(tx,u.id,"trip","2030-05-01")),/ya se aplicó/);assert.equal(await prisma.task.count({where:{userId:u.id}}),3);
 await withUserLock(u.id,tx=>createBundleTasks(tx,u.id,"trip","2030-06-01"));assert.equal(await prisma.task.count({where:{userId:u.id}}),6);
 const fixed=await prisma.event.create({data:{userId:u.id,title:"Fixed",startsAt:new Date(day+"T08:00Z"),endsAt:new Date(day+"T08:30Z")}});
 await withUserLock(u.id,tx=>createTemplateWeek(tx,u.id,"balanced",day,now));assert.equal(await prisma.dayOverride.count({where:{userId:u.id}}),7);assert.equal((await prisma.dayOverride.findUniqueOrThrow({where:{userId_date:{userId:u.id,date:dateOnly(day)}}})).endTime,"17:00");
 assert.equal((await prisma.dayOverride.findUniqueOrThrow({where:{userId_date:{userId:u.id,date:dateOnly("2030-04-20")}}})).paused,true);
 assert.equal((await prisma.user.findUniqueOrThrow({where:{id:u.id}})).dayEnd,"12:00");assert.equal((await prisma.event.findUniqueOrThrow({where:{id:fixed.id}})).title,"Fixed");
 await assert.rejects(withUserLock(u.id,tx=>createTemplateWeek(tx,u.id,"mornings","2030-04-16",now)),/primer día/);
});
test("stopping a series preserves its open period and manually fixed future task",async()=>{
 const {stopTaskSeries}=await import("../../src/lib/planning-templates");const u=await account(),other=await account();
 const series=await prisma.taskSeries.create({data:{userId:u.id,title:"Backups",durationMinutes:30,frequency:"WEEKLY",anchorDate:dateOnly(day),windowDays:7}});
 await withUserLock(u.id,tx=>materializeTaskSeries(tx,u.id,day,"2030-05-15"));
 const tasks=await prisma.task.findMany({where:{seriesId:series.id},orderBy:{availableFrom:"asc"}});
 await prisma.event.create({data:{userId:u.id,title:tasks[1].title,taskId:tasks[1].id,source:"AUTO",locked:true,startsAt:new Date("2030-04-22T08:00Z"),endsAt:new Date("2030-04-22T08:30Z")}});
 await assert.rejects(withUserLock(other.id,tx=>stopTaskSeries(tx,other.id,series.id,new Date(day+"T09:00Z"))),/no encontrada/);
 await withUserLock(u.id,tx=>stopTaskSeries(tx,u.id,series.id,new Date(day+"T09:00Z")));
 assert.equal((await prisma.task.findUniqueOrThrow({where:{id:tasks[0].id}})).archived,false);assert.equal((await prisma.task.findUniqueOrThrow({where:{id:tasks[1].id}})).archived,false);assert.equal((await prisma.task.findUniqueOrThrow({where:{id:tasks[2].id}})).archived,true);
 assert.equal((await prisma.taskSeries.findUniqueOrThrow({where:{id:series.id}})).active,false);
});
test("expired flexible windows are warned and not automatically scheduled outside their period",async()=>{
 const u=await account();const series=await prisma.taskSeries.create({data:{userId:u.id,title:"Weekly",durationMinutes:30,frequency:"WEEKLY",anchorDate:dateOnly("2030-04-08"),windowDays:1}});
 await withUserLock(u.id,tx=>materializeTaskSeries(tx,u.id,"2030-04-08","2030-04-09"));
 const expired=await prisma.task.findFirstOrThrow({where:{seriesId:series.id}});
 await generateDay(u.id,day,{now});assert.equal(await prisma.event.count({where:{taskId:expired.id}}),0);
 assert.match(JSON.stringify((await prisma.dayPlan.findFirstOrThrow({where:{userId:u.id}})).details),/ventana.*venció/);
});
test("invalid daylight-saving special hours roll back the entire date range",async()=>{
 const u=await account();await prisma.user.update({where:{id:u.id},data:{timezone:"America/New_York"}});
 await assert.rejects(withUserLock(u.id,tx=>applyException(tx,u.id,{start:"2030-03-09",until:"2030-03-11",label:"DST",mode:"HOURS",startTime:"02:30",endTime:"04:00"},new Date("2030-03-08T12:00Z"))),/no existe/);
 assert.equal(await prisma.dayOverride.count({where:{userId:u.id}}),0);
});

test("worker renews flexible tasks even with agenda automation disabled",async()=>{
 const u=await account();await prisma.taskSeries.create({data:{userId:u.id,title:"Bill",durationMinutes:20,frequency:"MONTHLY",anchorDate:dateOnly(day),windowDays:7}});
 await runDuePlans(new Date(day+"T09:00Z"),{userIds:[u.id]});assert.ok(await prisma.task.count({where:{userId:u.id}})>0);assert.equal(await prisma.dayPlan.count({where:{userId:u.id}}),0);
});

test("changing a weekly target releases future flexible reservations but keeps completions",async()=>{
 const {clearPendingHabitBlocks}=await import("../../src/lib/weekly-habits");const u=await account();const h=await prisma.habit.create({data:{userId:u.id,title:"Routine",durationMinutes:30,daysOfWeek:[],frequencyMode:"WEEKLY",weeklyTarget:3}});
 for(const d of [day,"2030-04-16","2030-04-17"])await generateDay(u.id,d,{now});
 const first=await prisma.event.findFirstOrThrow({where:{habitId:h.id},orderBy:{startsAt:"asc"}});await prisma.event.update({where:{id:first.id},data:{status:"DONE"}});await prisma.habitOccurrence.update({where:{id:first.occurrenceId!},data:{status:"DONE"}});
 await withUserLock(u.id,async tx=>{await clearPendingHabitBlocks(tx,u.id,h.id,now);await tx.habit.update({where:{id:h.id},data:{weeklyTarget:1}});});
 await generateDay(u.id,"2030-04-16",{now});assert.equal(await prisma.event.count({where:{habitId:h.id}}),1);assert.equal((await prisma.event.findUniqueOrThrow({where:{id:first.id}})).status,"DONE");
});
