import "dotenv/config";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { withUserLock } from "../../src/lib/transaction";
import { captureAgenda, stateHash, undoPlan } from "../../src/lib/plan-history";
import { previewTaskPlan, confirmTaskPreview } from "../../src/lib/task-preview";
import { generateDay } from "../../src/lib/planner";
import { setEventStatus } from "../../src/lib/calendar";
import { resolveProcrastination } from "../../src/lib/procrastination";
import { closeDay, storeFeedback } from "../../src/lib/plan-feedback";
import { dateOnly, addLocalDays } from "../../src/lib/time";
import { weeklyCategoryProgress } from "../../src/lib/category-budgets";
const ids:string[]=[];const day="2030-04-15",now=new Date(day+"T07:00:00Z");
async function account() { const user=await prisma.user.create({data:{email:randomUUID()+"@transparency.test.invalid",name:"Test",passwordHash:"unused",timezone:"UTC",dayStart:"08:00",dayEnd:"18:00",bufferMinutes:0,onboardingCompleted:true}});ids.push(user.id);return user; }
function input(title="Hypothetical task") { const form=new FormData();for(const [key,value] of Object.entries({title,durationMinutes:"30",priority:"1",preferredWindow:"ANY",energy:"LIGHT",categoryId:"",dueDate:""}))form.set(key,value);return form; }
async function latest(userId:string) { return prisma.planRevision.findFirstOrThrow({where:{userId},orderBy:{createdAt:"desc"}}); }
after(async()=>{for(const userId of ids){await prisma.event.deleteMany({where:{userId}});await prisma.habitOccurrence.deleteMany({where:{userId}});await prisma.user.delete({where:{id:userId}});}await prisma.$disconnect();});
test("what-if uses the real engine, rolls back every write and commits exactly once",async()=>{
  const user=await account();await prisma.task.create({data:{userId:user.id,title:"Existing",durationMinutes:40}});
  const fixed=await prisma.event.create({data:{userId:user.id,title:"Fixed",startsAt:new Date(day+"T09:00Z"),endsAt:new Date(day+"T10:00Z")}});
  await generateDay(user.id,day,{now});
  const before=await captureAgenda(prisma,user.id,day),revisionCount=await prisma.planRevision.count({where:{userId:user.id}});
  const preview=await previewTaskPlan(user.id,input(),day,now);assert.equal(preview.taskFits,true);assert.ok(preview.before.some(b=>b.title==="Fixed"&&b.fixed));
  assert.equal(stateHash(await captureAgenda(prisma,user.id,day)),stateHash(before));assert.equal(await prisma.planRevision.count({where:{userId:user.id}}),revisionCount);
  const confirmations=await Promise.allSettled([confirmTaskPreview(user.id,input(),preview.token,now),confirmTaskPreview(user.id,input(),preview.token,now)]);
  assert.equal(confirmations.filter(c=>c.status==="fulfilled").length,1);
  const after=await prisma.event.findMany({where:{userId:user.id,status:{notIn:["CANCELLED","SKIPPED"]}},orderBy:{startsAt:"asc"}});
  assert.deepEqual(after.map(e=>[e.title,e.startsAt.toISOString(),e.endsAt.toISOString()]),preview.after.map(e=>[e.title,e.startsAt,e.endsAt]));
  assert.equal((await prisma.event.findUniqueOrThrow({where:{id:fixed.id}})).startsAt.getTime(),fixed.startsAt.getTime());
});
test("preview refuses stale state, changed inputs, expired tokens, tampering and another account",async()=>{
  const user=await account(),other=await account();const preview=await previewTaskPlan(user.id,input(),day,now);
  await assert.rejects(confirmTaskPreview(other.id,input(),preview.token,now),/otra cuenta/);
  await assert.rejects(confirmTaskPreview(user.id,input("Changed"),preview.token,now),/tarea cambió/);
  await assert.rejects(confirmTaskPreview(user.id,input(),preview.token,new Date(now.getTime()+300001)),/caducó/);
  await assert.rejects(confirmTaskPreview(user.id,input(),preview.token.slice(0,-4)+"AAAA",now),/inválida/);
  await prisma.task.create({data:{userId:user.id,title:"Concurrent task",durationMinutes:20}});
  await assert.rejects(confirmTaskPreview(user.id,input(),preview.token,now),/agenda o la hora cambió/);
  assert.equal(await prisma.task.count({where:{userId:user.id,title:"Hypothetical task"}}),0);
});
test("preview rolls back recurring tasks, occurrences and failed no-fit previews",async()=>{
  const user=await account();await prisma.user.update({where:{id:user.id},data:{dayEnd:"08:15"}});
  await prisma.taskSeries.create({data:{userId:user.id,title:"Recurring",durationMinutes:10,priority:2,preferredWindow:"ANY",energy:"LIGHT",frequency:"WEEKLY",anchorDate:dateOnly(day),windowDays:2}});
  await prisma.habit.create({data:{userId:user.id,title:"Habit",durationMinutes:10,daysOfWeek:[1]}});
  const preview=await previewTaskPlan(user.id,input(),day,now);assert.equal(preview.taskFits,false);
  assert.equal(await prisma.task.count({where:{userId:user.id}}),0);assert.equal(await prisma.habitOccurrence.count({where:{userId:user.id}}),0);assert.equal(await prisma.dayPlan.count({where:{userId:user.id}}),0);
});
test("undo restores identifiers, task status, day mode and protects fixed or completed blocks",async()=>{
  const user=await account(),task=await prisma.task.create({data:{userId:user.id,title:"Original",durationMinutes:40}});
  const fixed=await prisma.event.create({data:{userId:user.id,title:"Fixed",startsAt:new Date(day+"T12:00Z"),endsAt:new Date(day+"T13:00Z")}});
  await generateDay(user.id,day,{now});const original=await prisma.event.findFirstOrThrow({where:{taskId:task.id}});
  const added=await prisma.task.create({data:{userId:user.id,title:"Added urgent",durationMinutes:30,priority:1}});
  await generateDay(user.id,day,{now,dayMode:"SHORT"});const revision=await latest(user.id);
  await undoPlan(user.id,revision.id,now);
  const restored=await prisma.event.findUniqueOrThrow({where:{id:original.id}});assert.equal(restored.startsAt.getTime(),original.startsAt.getTime());
  assert.equal((await prisma.task.findUniqueOrThrow({where:{id:added.id}})).status,"INBOX");assert.equal(await prisma.event.count({where:{id:fixed.id}}),1);
  assert.equal(await prisma.dayOverride.count({where:{userId:user.id}}),0);assert.ok((await prisma.planRevision.findUniqueOrThrow({where:{id:revision.id}})).undoneAt);
  await assert.rejects(undoPlan(user.id,revision.id,now),/ya no/);
  await withUserLock(user.id,tx=>setEventStatus(tx,user.id,original.id,"DONE",{now}));
  await generateDay(user.id,day,{now});assert.equal((await prisma.event.findUniqueOrThrow({where:{id:original.id}})).status,"DONE");
});
test("undo is atomic and refuses completed, elapsed, edited and foreign plans",async()=>{
  const user=await account(),other=await account();await prisma.task.create({data:{userId:user.id,title:"Task",durationMinutes:30}});await generateDay(user.id,day,{now});
  const revision=await latest(user.id),event=await prisma.event.findFirstOrThrow({where:{userId:user.id}});
  await assert.rejects(undoPlan(other.id,revision.id,now),/ya no/);
  await assert.rejects(undoPlan(user.id,revision.id,new Date(day+"T08:01Z")),/ya empezó/);
  await withUserLock(user.id,tx=>setEventStatus(tx,user.id,event.id,"DONE",{now}));
  const state=stateHash(await captureAgenda(prisma,user.id,day));await assert.rejects(undoPlan(user.id,revision.id,now),/agenda cambió/);assert.equal(stateHash(await captureAgenda(prisma,user.id,day)),state);
});
test("postponements count distinct skipped or expired blocks and offer concrete resolutions",async()=>{
  const user=await account(),task=await prisma.task.create({data:{userId:user.id,title:"Avoided",durationMinutes:60}});
  for(let i=0;i<3;i++){const date=addLocalDays(day,i);await generateDay(user.id,date,{now});const event=await prisma.event.findFirstOrThrow({where:{userId:user.id,taskId:task.id,status:"PENDING"}});await withUserLock(user.id,async tx=>{await setEventStatus(tx,user.id,event.id,"SKIPPED",{now});await setEventStatus(tx,user.id,event.id,"SKIPPED",{now});});}
  assert.equal((await prisma.task.findUniqueOrThrow({where:{id:task.id}})).postponements,3);
  await withUserLock(user.id,tx=>resolveProcrastination(tx,user.id,task.id,{choice:"REDUCE",durationMinutes:30},now));assert.equal((await prisma.task.findUniqueOrThrow({where:{id:task.id}})).durationMinutes,30);
  await assert.rejects(withUserLock(user.id,tx=>resolveProcrastination(tx,user.id,task.id,{choice:"DELETE"},now)),/tres aplazamientos/);
  const split=await prisma.task.create({data:{userId:user.id,title:"Split me",durationMinutes:60,postponements:3}});await withUserLock(user.id,tx=>resolveProcrastination(tx,user.id,split.id,{choice:"SPLIT",parts:[{title:"Step A",durationMinutes:15},{title:"Step B",durationMinutes:20}]},now));assert.equal((await prisma.task.findUniqueOrThrow({where:{id:split.id}})).archived,true);
  assert.equal(await prisma.task.count({where:{userId:user.id,title:{in:["Step A","Step B"]}}}),2);
  const delegated=await prisma.task.create({data:{userId:user.id,title:"Delegate",postponements:3}});await withUserLock(user.id,tx=>resolveProcrastination(tx,user.id,delegated.id,{choice:"DELEGATE",delegatedTo:"Teammate"},now));assert.equal((await prisma.task.findUniqueOrThrow({where:{id:delegated.id}})).delegatedTo,"Teammate");
  await generateDay(user.id,day,{now});assert.equal(await prisma.event.count({where:{taskId:delegated.id,status:"PENDING"}}),0);
});
test("end-of-day resolves multiple blocks atomically, records real duration and learns once per day",async()=>{
  const user=await account();await prisma.task.createMany({data:[{userId:user.id,title:"Done",durationMinutes:30},{userId:user.id,title:"Tomorrow",durationMinutes:30}]});await generateDay(user.id,day,{now});
  const events=await prisma.event.findMany({where:{userId:user.id},orderBy:{startsAt:"asc"}});const rows=events.map((e,i)=>({id:e.id,updatedAt:e.updatedAt.toISOString(),decision:i===0?"DONE" as const:"POSTPONE" as const,...(i===0?{actualMinutes:45}:{})}));
  await assert.rejects(withUserLock(user.id,tx=>closeDay(tx,user.id,day,{mood:"BUSY",note:"",learn:true,rows:[rows[0],{...rows[1],updatedAt:"2000-01-01T00:00:00.000Z"}]},now)),/cambió/);
  assert.equal((await prisma.event.findUniqueOrThrow({where:{id:events[0].id}})).status,"PENDING");
  await withUserLock(user.id,tx=>closeDay(tx,user.id,day,{mood:"BUSY",note:"Too much",learn:true,rows},now));
  assert.equal((await prisma.event.findUniqueOrThrow({where:{id:events[0].id}})).actualMinutes,45);const tomorrow=await prisma.task.findUniqueOrThrow({where:{id:events[1].taskId!}});assert.equal(tomorrow.availableFrom?.toISOString().slice(0,10),addLocalDays(day,1));assert.equal(tomorrow.postponements,1);
  await withUserLock(user.id,tx=>closeDay(tx,user.id,day,{mood:"DIFFICULT",note:"",learn:true,rows:[]},now));assert.equal(await prisma.planFeedback.count({where:{userId:user.id,reason:"OVERLOADED"}}),1);
  const other=await account();await assert.rejects(withUserLock(other.id,tx=>closeDay(tx,other.id,day,{mood:"OK",note:"",learn:false,rows},now)),/no encontrado/);
});
test("feedback changes spacing, unspecified times and estimates without altering the base task",async()=>{
  const user=await account(),task=await prisma.task.create({data:{userId:user.id,title:"Learn",durationMinutes:40}});await generateDay(user.id,day,{now});const event=await prisma.event.findFirstOrThrow({where:{taskId:task.id}});
  await withUserLock(user.id,async tx=>{await storeFeedback(tx,user.id,day,{reason:"OVERLOADED"},now);await storeFeedback(tx,user.id,day,{reason:"BAD_TIME",preferredWindow:"AFTERNOON"},now);await storeFeedback(tx,user.id,day,{reason:"ESTIMATE",eventId:event.id,suggestedMinutes:80},now);});
  const category=await prisma.categoryBudget.create({data:{userId:user.id,name:"Focus signal",weeklyMinutes:120}});
  await generateDay(user.id,day,{now});const reserved=await prisma.event.findMany({where:{userId:user.id,categoryId:category.id,status:"PENDING"}});assert.ok(reserved.length);assert.ok(reserved.every(e=>e.startsAt.getUTCHours()>=12));const learned=await prisma.event.findFirstOrThrow({where:{taskId:task.id,status:"PENDING"}});assert.equal(learned.estimatedMinutes,50);assert.ok(learned.startsAt.getUTCHours()>=12);assert.match(learned.planningReason!,/señales de sobrecarga/);assert.equal((await prisma.task.findUniqueOrThrow({where:{id:task.id}})).durationMinutes,40);
});
test("category objectives reserve unmet time, count tasks once and recover missed reservations",async()=>{
  const user=await account(),category=await prisma.categoryBudget.create({data:{userId:user.id,name:"Study",weeklyMinutes:300}});
  await prisma.task.create({data:{userId:user.id,title:"Study task",categoryId:category.id,durationMinutes:30}});
  await generateDay(user.id,day,{now});const initial=await prisma.event.findMany({where:{userId:user.id}});assert.ok(initial.some(e=>e.categoryId===category.id&&!e.taskId));
  await generateDay(user.id,day,{now});const repeated=await prisma.event.findMany({where:{userId:user.id,status:"PENDING"}});assert.deepEqual(repeated.map(e=>[e.title,e.startsAt.toISOString()]).sort(),initial.map(e=>[e.title,e.startsAt.toISOString()]).sort());
  const progress=await weeklyCategoryProgress(prisma,user.id,day,now);assert.ok(progress[0].reserved>=30);assert.ok(progress[0].missing>0);
  for(let i=1;i<7;i++)await generateDay(user.id,addLocalDays(day,i),{now});
  const whole=await weeklyCategoryProgress(prisma,user.id,day,now);assert.equal(whole[0].done+whole[0].reserved,300);
  const nextNow=new Date("2030-04-21T07:00Z");await generateDay(user.id,"2030-04-21",{now:nextNow});const recovery=await weeklyCategoryProgress(prisma,user.id,day,nextNow);assert.equal(recovery[0].done+recovery[0].reserved,300);
});

test("correcting a check-in removes only its own overload signal and preserves explicit feedback",async()=>{
 const user=await account();const input={mood:"BUSY" as const,note:"",learn:true,rows:[]};
 await withUserLock(user.id,tx=>closeDay(tx,user.id,day,input,now));assert.equal((await prisma.planFeedback.findFirstOrThrow({where:{userId:user.id}})).source,"CHECK_IN");
 await withUserLock(user.id,tx=>closeDay(tx,user.id,day,{...input,mood:"OK"},now));assert.equal(await prisma.planFeedback.count({where:{userId:user.id}}),0);
 await withUserLock(user.id,tx=>storeFeedback(tx,user.id,day,{reason:"OVERLOADED"},now));await withUserLock(user.id,tx=>closeDay(tx,user.id,day,{...input,mood:"OK"},now));assert.equal(await prisma.planFeedback.count({where:{userId:user.id,source:"EXPLICIT"}}),1);
});
test("a preview cannot apply an elapsed five-minute slot on the same local day",async()=>{
 const user=await account(),viewTime=new Date(day+"T08:01:00Z"),preview=await previewTaskPlan(user.id,input(),day,viewTime);
 await assert.rejects(confirmTaskPreview(user.id,input(),preview.token,new Date(day+"T08:06:00Z")),/agenda o la hora cambió/);assert.equal(await prisma.task.count({where:{userId:user.id}}),0);
});
test("end-of-day preserves a flexible task's expired period and counts automatic carryover once",async()=>{
 const user=await account(),series=await prisma.taskSeries.create({data:{userId:user.id,title:"Window",durationMinutes:30,priority:1,preferredWindow:"ANY",energy:"LIGHT",frequency:"WEEKLY",anchorDate:dateOnly(day),windowDays:1}});
 await generateDay(user.id,day,{now});const task=await prisma.task.findFirstOrThrow({where:{userId:user.id,seriesId:series.id,periodStart:dateOnly(day)}}),event=await prisma.event.findFirstOrThrow({where:{taskId:task.id}});
 await withUserLock(user.id,tx=>closeDay(tx,user.id,day,{mood:"OK",note:"",learn:false,rows:[{id:event.id,updatedAt:event.updatedAt.toISOString(),decision:"POSTPONE"}]},now));
 assert.equal((await prisma.task.findUniqueOrThrow({where:{id:task.id}})).availableFrom?.getTime(),task.availableFrom?.getTime());
 const overdue=await prisma.task.create({data:{userId:user.id,title:"Overdue",status:"SCHEDULED"}});await prisma.event.create({data:{userId:user.id,taskId:overdue.id,title:overdue.title,source:"AUTO",locked:false,planningDate:dateOnly(addLocalDays(day,-1)),startsAt:new Date(addLocalDays(day,-1)+"T09:00Z"),endsAt:new Date(addLocalDays(day,-1)+"T09:30Z")}});
 await generateDay(user.id,day,{now});await generateDay(user.id,day,{now});assert.equal((await prisma.task.findUniqueOrThrow({where:{id:overdue.id}})).postponements,1);
});
