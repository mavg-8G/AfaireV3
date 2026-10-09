import "dotenv/config";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { generateDay, type Unscheduled } from "../../src/lib/planner";
import { setEventStatus } from "../../src/lib/calendar";
import { withUserLock } from "../../src/lib/transaction";
import { resolveUnscheduledInTransaction } from "../../src/lib/resolve-unscheduled";
import { dateOnly } from "../../src/lib/time";
const day="2030-04-15",now=new Date(day+"T07:00Z"), ids:string[]=[];
async function account(end="10:00") { const user=await prisma.user.create({data:{email:randomUUID()+"@task-planning.test.invalid",name:"Test",passwordHash:"unused",timezone:"UTC",dayStart:"08:00",dayEnd:end,bufferMinutes:0}});ids.push(user.id);return user; }
async function blocks(taskId:string) {return prisma.event.findMany({where:{taskId,status:{in:["PENDING","IN_PROGRESS","DONE"]}},orderBy:{startsAt:"asc"}});}
async function details(userId:string) {return (await prisma.dayPlan.findUniqueOrThrow({where:{userId_date:{userId,date:dateOnly(day)}}})).details as unknown as Unscheduled[];}
after(async()=>{for(const userId of ids){await prisma.event.deleteMany({where:{userId}});await prisma.habitOccurrence.deleteMany({where:{userId}});await prisma.user.delete({where:{id:userId}});}await prisma.$disconnect();});

test("persists fragments, replans deterministically, and completes only after all work",async()=>{
  const user=await account();
  await prisma.event.create({data:{userId:user.id,title:"Fixed",startsAt:new Date(day+"T08:40Z"),endsAt:new Date(day+"T09:20Z")}});
  const task=await prisma.task.create({data:{userId:user.id,title:"Split",durationMinutes:60,splittable:true,minChunk:30}});
  await Promise.all([generateDay(user.id,day,{now}),generateDay(user.id,day,{now})]);
  let events=await blocks(task.id); assert.deepEqual(events.map(e=>[e.chunkIndex,e.chunkCount,e.estimatedMinutes]),[[1,2,30],[2,2,30]]);
  const first=events[0];await withUserLock(user.id,tx=>setEventStatus(tx,user.id,first.id,"DONE",{now}));
  assert.equal((await prisma.task.findUniqueOrThrow({where:{id:task.id}})).status,"SCHEDULED");
  await generateDay(user.id,day,{now});events=await blocks(task.id);
  assert.equal(events.length,2);assert.equal(events[0].id,first.id);assert.equal(events[1].estimatedMinutes,30);
  await withUserLock(user.id,tx=>setEventStatus(tx,user.id,events[1].id,"SKIPPED",{now}));
  assert.equal((await prisma.task.findUniqueOrThrow({where:{id:task.id}})).status,"INBOX");
  await generateDay(user.id,day,{now});events=await blocks(task.id);assert.equal(events.length,2);
  await withUserLock(user.id,tx=>setEventStatus(tx,user.id,events[1].id,"DONE",{now}));
  assert.equal((await prisma.task.findUniqueOrThrow({where:{id:task.id}})).status,"DONE");
  await withUserLock(user.id,tx=>setEventStatus(tx,user.id,events[1].id,"PENDING",{now}));
  assert.equal((await prisma.task.findUniqueOrThrow({where:{id:task.id}})).status,"SCHEDULED");
});
test("protected in-progress fragments keep their identity and only remaining work is scheduled",async()=>{
  const user=await account();await prisma.event.create({data:{userId:user.id,title:"Fixed",startsAt:new Date(day+"T08:40Z"),endsAt:new Date(day+"T09:20Z")}});
  const task=await prisma.task.create({data:{userId:user.id,title:"Work",durationMinutes:60,splittable:true,minChunk:30}});
  await generateDay(user.id,day,{now});const first=(await blocks(task.id))[0];
  await withUserLock(user.id,tx=>setEventStatus(tx,user.id,first.id,"IN_PROGRESS",{now}));
  await generateDay(user.id,day,{now});const events=await blocks(task.id);
  assert.equal(events.length,2);assert.equal(events[0].id,first.id);assert.equal(events.reduce((n,e)=>n+e.estimatedMinutes!,0),60);
});
test("structured no-fit can enable splitting in one action and isolates accounts",async()=>{
  const user=await account(),other=await account();await prisma.event.create({data:{userId:user.id,title:"Fixed",startsAt:new Date(day+"T08:40Z"),endsAt:new Date(day+"T09:20Z")}});
  const task=await prisma.task.create({data:{userId:user.id,title:"Deep",energy:"DEEP",durationMinutes:60}});
  await generateDay(user.id,day,{now});const entry=(await details(user.id))[0];
  assert.equal(entry.code,"NO_CONTIGUOUS_SLOT");const index=entry.actions!.findIndex(a=>a.type==="SPLIT");assert.ok(index>=0);
  await assert.rejects(withUserLock(other.id,tx=>resolveUnscheduledInTransaction(tx,other.id,day,entry.key,index,1,now)),/cambió|ya no/);
  await withUserLock(user.id,tx=>resolveUnscheduledInTransaction(tx,user.id,day,entry.key,index,1,now));
  assert.equal((await blocks(task.id)).length,2);assert.equal((await details(user.id)).length,0);
  await assert.rejects(withUserLock(user.id,tx=>resolveUnscheduledInTransaction(tx,user.id,day,entry.key,index,1,now)),/cambió|ya no/);
});
test("shortening updates duration and replans; release identifies and postpones a concrete flexible blocker",async()=>{
  const user=await account("09:00");
  const blocker=await prisma.task.create({data:{userId:user.id,title:"Flexible blocker",durationMinutes:30,priority:1}});
  const task=await prisma.task.create({data:{userId:user.id,title:"No room",durationMinutes:60,priority:3}});
  await generateDay(user.id,day,{now});const entry=(await details(user.id)).find(e=>e.key===`task:${task.id}`)!;
  assert.equal(entry.code,"CAPACITY_EXCEEDED");const action=entry.actions!.find(a=>a.type==="RELEASE_BLOCK");assert.ok(action&&action.type==="RELEASE_BLOCK");assert.equal(action.title,blocker.title);
  await withUserLock(user.id,tx=>resolveUnscheduledInTransaction(tx,user.id,day,entry.key,entry.actions!.indexOf(action),1,now));
  assert.equal((await blocks(task.id)).length,1);assert.equal((await blocks(blocker.id)).length,0);
  assert.equal((await prisma.task.findUniqueOrThrow({where:{id:blocker.id}})).availableFrom!.toISOString().slice(0,10),"2030-04-16");
  const shortUser=await account("08:30"),long=await prisma.task.create({data:{userId:shortUser.id,title:"Long",durationMinutes:60}});
  await generateDay(shortUser.id,day,{now});const shortEntry=(await details(shortUser.id))[0];
  await withUserLock(shortUser.id,tx=>resolveUnscheduledInTransaction(tx,shortUser.id,day,shortEntry.key,shortEntry.actions!.findIndex(a=>a.type==="SHORTEN"),1,now));
  assert.equal((await prisma.task.findUniqueOrThrow({where:{id:long.id}})).durationMinutes,30);assert.equal((await blocks(long.id)).length,1);
});
test("expired recurrence reports deadline and the action recovers it",async()=>{
  const user=await account(),series=await prisma.taskSeries.create({data:{userId:user.id,title:"Old series",durationMinutes:20,frequency:"WEEKLY",anchorDate:dateOnly("2030-04-01"),active:false}});
  const task=await prisma.task.create({data:{userId:user.id,title:"Expired",durationMinutes:20,seriesId:series.id,periodStart:dateOnly("2030-04-01"),availableFrom:dateOnly("2030-04-01"),dueDate:dateOnly("2030-04-02")}});
  await generateDay(user.id,day,{now});const entry=(await details(user.id))[0];assert.equal(entry.code,"DEADLINE_PASSED");
  await withUserLock(user.id,tx=>resolveUnscheduledInTransaction(tx,user.id,day,entry.key,0,1,now));assert.equal((await blocks(task.id)).length,1);
});
test("effective urgency uses the local planning date and persisted user settings",async()=>{
  const user=await account("08:30");
  const high=await prisma.task.create({data:{userId:user.id,title:"High without date",durationMinutes:30,priority:1}});
  const due=await prisma.task.create({data:{userId:user.id,title:"Due tomorrow",durationMinutes:30,priority:3,dueDate:dateOnly("2030-04-16")}});
  await generateDay(user.id,day,{now});assert.equal((await blocks(due.id)).length,1);assert.equal((await blocks(high.id)).length,0);
  assert.match((await blocks(due.id))[0].planningReason!,/base 3, efectiva 1/);
  await prisma.user.update({where:{id:user.id},data:{urgencyEnabled:false}});
  await generateDay(user.id,day,{now});assert.equal((await blocks(high.id)).length,1);assert.equal((await blocks(due.id)).length,0);
  await prisma.user.update({where:{id:user.id},data:{timezone:"America/Guayaquil",urgencyEnabled:true}});
  await generateDay(user.id,day,{now:new Date(day+"T02:00Z")});assert.equal((await blocks(due.id)).length,1);
});
test("carryover reschedules only unfinished minutes and excludes fragment samples from duration learning",async()=>{
  const user=await account();await prisma.user.update({where:{id:user.id},data:{adaptiveDurations:true}});
  await prisma.event.create({data:{userId:user.id,title:"Fixed",startsAt:new Date(day+"T08:40Z"),endsAt:new Date(day+"T09:20Z")}});
  const task=await prisma.task.create({data:{userId:user.id,title:"Carry fragments",durationMinutes:60,splittable:true,minChunk:30}});
  await generateDay(user.id,day,{now});const first=(await blocks(task.id))[0];
  await withUserLock(user.id,tx=>setEventStatus(tx,user.id,first.id,"DONE",{now}));
  await generateDay(user.id,"2030-04-16",{now:new Date("2030-04-16T07:00Z")});const events=await blocks(task.id);
  assert.equal(events.length,2);assert.equal(events[0].id,first.id);assert.equal(events[1].estimatedMinutes,30);
  assert.equal(events[1].chunkIndex,2);assert.equal(events[1].chunkCount,2);
});
test("stale proposals and an elapsed slot cannot partially mutate the task or plan",async()=>{
  const user=await account("08:30"),task=await prisma.task.create({data:{userId:user.id,title:"Too long",durationMinutes:60}});
  await generateDay(user.id,day,{now});const entry=(await details(user.id))[0],index=entry.actions!.findIndex(a=>a.type==="SHORTEN");
  await assert.rejects(withUserLock(user.id,tx=>resolveUnscheduledInTransaction(tx,user.id,day,entry.key,index,1,new Date(day+"T08:25Z"))),/tiempo disponible cambió/);
  assert.equal((await prisma.task.findUniqueOrThrow({where:{id:task.id}})).durationMinutes,60);
  assert.equal((await prisma.dayPlan.findUniqueOrThrow({where:{userId_date:{userId:user.id,date:dateOnly(day)}}})).version,1);
  await generateDay(user.id,day,{now});
  await assert.rejects(withUserLock(user.id,tx=>resolveUnscheduledInTransaction(tx,user.id,day,entry.key,index,1,now)),/plan cambió/);
});
