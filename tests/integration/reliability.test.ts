import "dotenv/config";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fc from "fast-check";
import { prisma } from "../../src/lib/prisma";
import { generateDay } from "../../src/lib/planner";
import { withUserLock } from "../../src/lib/transaction";
import { taskDurationSuggestions, applyTaskDurationSuggestion } from "../../src/lib/duration-suggestions";
import { withWorkerCycleLock } from "../../src/lib/worker-lock";
import { heartbeatHealthy, operationMetrics } from "../../src/lib/operations";
import { runPushNotifications } from "../../src/lib/push";
const ids: string[] = [];
const day="2030-04-15",now=new Date(day+"T08:10Z");
async function account() {const user=await prisma.user.create({data:{email:randomUUID()+"@reliability.test.invalid",name:"Test",passwordHash:"unused",timezone:"UTC",bufferMinutes:0,dayStart:"08:00",dayEnd:"10:00",adaptiveDurations:true}});ids.push(user.id);return user;}
after(async()=>{for(const userId of ids){await prisma.event.deleteMany({where:{userId}});await prisma.habitOccurrence.deleteMany({where:{userId}});await prisma.user.delete({where:{id:userId}});}await prisma.$disconnect();});
test("session lock excludes a second worker cycle and releases after success and failure",async()=>{
  let entered!:()=>void,release!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;});
  const blocked=new Promise<void>(resolve=>{release=resolve;});
  const first=withWorkerCycleLock(async()=>{entered();await blocked;return "first";},error=>{throw error;});
  try {
    await started;
    const second=await withWorkerCycleLock(async()=>{assert.fail("Overlapping worker cycle");},error=>{throw error;});
    assert.equal(second.acquired,false);
  } finally {release();}
  assert.deepEqual(await first,{acquired:true,result:"first"});
  await assert.rejects(withWorkerCycleLock(async()=>{throw new Error("Cycle failed");},error=>{throw error;}),/Cycle failed/);
  assert.deepEqual(await withWorkerCycleLock(async()=>"again",error=>{throw error;}),{acquired:true,result:"again"});
});
test("template learning persists, ignores short accidental completions, exposes evidence and isolates accounts",async()=>{
  const user=await account(),other=await account();
  for(const [i,minutes] of [1,2,35,35,35,35].entries()) {
    const old=await prisma.task.create({data:{userId:user.id,title:`Report ${i}`,durationMinutes:100,status:"DONE",learningMatch:"TEMPLATE",learningKey:"Weekly report"}});
    await prisma.event.create({data:{userId:user.id,taskId:old.id,source:"AUTO",title:old.title,status:"DONE",actualMinutes:minutes,estimatedMinutes:100,startsAt:new Date(`2030-04-${String(i+1).padStart(2,"0")}T08:00Z`),endsAt:new Date(`2030-04-${String(i+1).padStart(2,"0")}T09:40Z`)}});
  }
  const task=await prisma.task.create({data:{userId:user.id,title:"New title",durationMinutes:40,learningMatch:"TEMPLATE",learningKey:" weekly REPORT "}});
  const suggestions=await taskDurationSuggestions(prisma,user.id);assert.equal(suggestions.length,1);assert.equal(suggestions[0].samples,4);assert.equal(suggestions[0].median,35);
  await assert.rejects(withUserLock(other.id,tx=>applyTaskDurationSuggestion(tx,other.id,task.id)),/Ya no hay/);
  await generateDay(user.id,day,{now});
  const event=await prisma.event.findFirstOrThrow({where:{taskId:task.id,status:"PENDING"}});
  assert.equal(event.estimatedMinutes,35);assert.match(event.planningReason!,/Basado en 4 mediciones, mediana 35 min/);
});
test("property: persisted replanning retains fixed identities and never generates in the past",async()=>{
  const user=await account();const task=await prisma.task.create({data:{userId:user.id,title:"Variable",durationMinutes:30}});
  const fixedTask=await prisma.task.create({data:{userId:user.id,title:"Fixed",durationMinutes:30,status:"SCHEDULED"}});
  const fixed=await prisma.event.create({data:{userId:user.id,taskId:fixedTask.id,title:"Fixed",source:"AUTO",locked:true,planningDate:new Date(day),startsAt:new Date(day+"T08:45Z"),endsAt:new Date(day+"T09:15Z")}});
  await fc.assert(fc.asyncProperty(fc.integer({min:5,max:80}),fc.integer({min:0,max:100}),async(minutes,offset)=>{
    await prisma.event.deleteMany({where:{taskId:task.id}});
    await prisma.task.update({where:{id:task.id},data:{durationMinutes:minutes,status:"INBOX"}});
    const current=new Date(new Date(day+"T08:00Z").getTime()+offset*60000);
    await generateDay(user.id,day,{now:current});
    assert.deepEqual(await prisma.event.findUniqueOrThrow({where:{id:fixed.id}}),fixed);
    const events=await prisma.event.findMany({where:{userId:user.id,taskId:task.id,status:"PENDING"}});
    for(const event of events) {assert.ok(event.startsAt>=current);assert.ok(event.endsAt<=fixed.startsAt||event.startsAt>=fixed.endsAt);}
    const first=events.map(e=>[e.startsAt.toISOString(),e.endsAt.toISOString()]);
    await generateDay(user.id,day,{now:current});
    assert.deepEqual((await prisma.event.findMany({where:{userId:user.id,taskId:task.id,status:"PENDING"}})).map(e=>[e.startsAt.toISOString(),e.endsAt.toISOString()]),first);
  }),{numRuns:25,seed:20261009});
});
test("operational metrics use daily denominators, retain every generation and count transport retries",async()=>{
  const user=await account();await prisma.task.create({data:{userId:user.id,title:"Too long",durationMinutes:480}});
  await generateDay(user.id,day,{now});await generateDay(user.id,day,{now});await generateDay(user.id,"2030-04-16",{now});
  let metrics=await operationMetrics(user.id,now);assert.equal(metrics.days,2);assert.equal(metrics.blockedDays,2);assert.equal(metrics.blockedDaysPercent,100);assert.equal(metrics.generationCount,3);assert.ok(metrics.averageGenerationMs!>0);assert.equal(metrics.pushFailurePercent,null);
  await prisma.notificationSettings.create({data:{userId:user.id,dailySummary:true,summaryTime:"08:10",upcoming:false,dueTomorrow:false}});
  await prisma.pushSubscription.create({data:{userId:user.id,endpoint:"https://example.invalid/"+randomUUID(),auth:"unused",p256dh:"unused",sessionVersion:0}});
  await runPushNotifications(now,{userIds:[user.id],send:async()=>{throw {statusCode:503};}});
  await runPushNotifications(new Date(now.getTime()+180000),{userIds:[user.id],send:async()=>({statusCode:201,body:"",headers:{}})});
  metrics=await operationMetrics(user.id,new Date(now.getTime()+180000));assert.equal(metrics.pushAttempts,2);assert.equal(metrics.pushFailed,1);assert.equal(metrics.pushFailurePercent,50);
});
test("heartbeat threshold alerts after five minutes and handles missing signals",()=>{
  assert.equal(heartbeatHealthy(null,now),false);
  assert.equal(heartbeatHealthy({updatedAt:new Date(now.getTime()-300000)},now),true);
  assert.equal(heartbeatHealthy({updatedAt:new Date(now.getTime()-300001)},now),false);
});
