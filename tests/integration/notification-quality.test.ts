import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { runPushNotifications } from "../../src/lib/push";
import { withUserLock } from "../../src/lib/transaction";
import { applyTaskDurationSuggestion, taskDurationSuggestions } from "../../src/lib/duration-suggestions";
import { generateDay, runDuePlans } from "../../src/lib/planner";
import { dateOnly } from "../../src/lib/time";
const ids: string[] = [];
const now = new Date("2030-04-15T09:00Z");
const ok = async () => ({ statusCode: 201, headers: {}, body: "" });
async function account() {
 const user = await prisma.user.create({ data: { email: randomUUID()+"@test.invalid", passwordHash: "unused", name: "Quality", timezone: "UTC", onboardingCompleted: true } }); ids.push(user.id);
 await prisma.notificationSettings.create({ data: { userId: user.id, dailySummary: false, dueTomorrow: false } });
 await prisma.pushSubscription.create({ data: { userId: user.id, endpoint: "https://fcm.googleapis.com/fcm/send/"+randomUUID(), auth: "test", p256dh: "test", sessionVersion: user.sessionVersion } });
 return user;
}
async function event(userId: string, title = "Block", minute = 5) {
 return prisma.event.create({ data: { userId, title, startsAt: new Date(now.getTime()+minute*60000), endsAt: new Date(now.getTime()+(minute+1)*60000) } });
}
after(async () => { for(const userId of ids) { await prisma.event.deleteMany({ where: { userId } }); await prisma.habitOccurrence.deleteMany({ where: { userId } }); await prisma.user.delete({ where: { id: userId } }); } await prisma.$disconnect(); });
test("quiet hours, changed lead time and timezone cannot duplicate sent event", async () => {
 const user = await account(); await event(user.id); let sent = 0;
 const options = { userIds: [user.id], send: async () => { sent++; return ok(); } };
 await prisma.notificationSettings.update({ where: { userId: user.id }, data: { quietEnabled: true, quietStart: "08:00", quietEnd: "10:00" } });
 await runPushNotifications(now, options); assert.equal(sent, 0);
 await prisma.notificationSettings.update({ where: { userId: user.id }, data: { quietEnabled: false } });
 await runPushNotifications(now, options); assert.equal(sent, 1);
 await prisma.notificationSettings.update({ where: { userId: user.id }, data: { leadMinutes: 20 } });
 await prisma.user.update({ where: { id: user.id }, data: { timezone: "America/Guayaquil" } });
 await runPushNotifications(now, options); assert.equal(sent, 1);
});
test("each candidate is checked again after a concurrent calendar edit", async () => {
 const user = await account(); const blocks = await Promise.all([event(user.id,"First",1), event(user.id,"Done",2), event(user.id,"Skipped",3), event(user.id,"Moved",4), event(user.id,"Replanned",5)]);
 // Fetch order has no guarantee: whichever candidate is sent first changes all others.
 let sends = 0;
 await runPushNotifications(now, { userIds: [user.id], send: async (_subscription, payload) => {
   sends++; const key = (JSON.parse(String(payload)) as {key:string}).key;
   const current = blocks.find(b => key.startsWith(`event:${b.id}:`))!;
   const rest = blocks.filter(b => b.id !== current.id);
   await prisma.event.update({ where: { id: rest[0].id }, data: { status: "DONE" } });
   await prisma.event.update({ where: { id: rest[1].id }, data: { status: "SKIPPED" } });
   await prisma.event.update({ where: { id: rest[2].id }, data: { startsAt: new Date("2030-04-15T12:00Z"), endsAt: new Date("2030-04-15T12:30Z") } });
   await prisma.event.delete({ where: { id: rest[3].id } });
   return ok();
 } }); assert.equal(sends, 1);
});
test("failed delivery is not retried after completing or replanning its block", async () => {
 const user = await account(); const old = await event(user.id);
 await runPushNotifications(now, { userIds:[user.id], send: async () => { throw {statusCode:503}; } });
 await withUserLock(user.id, tx => tx.event.update({ where:{id:old.id}, data:{status:"DONE"} }));
 let sent=0; const options={userIds:[user.id],send:async()=>{sent++;return ok();}};
 await runPushNotifications(new Date(now.getTime()+180000),options);assert.equal(sent,0);
 await withUserLock(user.id, tx => tx.event.delete({where:{id:old.id}}));
 await generateDay(user.id,"2030-04-15",{now});
 await runPushNotifications(new Date(now.getTime()+180000),options);assert.equal(sent,0);
 assert.equal(await prisma.workerRun.count({where:{userId:user.id,kind:"PUSH",status:"FAILED"}}),1);
});
test("404 and 410 remove endpoints and keep visible audit records", async () => {
 for(const statusCode of [404,410]) {
   const user=await account();await event(user.id);
   const result=await runPushNotifications(now,{userIds:[user.id],send:async()=>{throw {statusCode};}});
   assert.equal(result.expired,1);assert.equal(await prisma.pushSubscription.count({where:{userId:user.id}}),0);
   const run=await prisma.workerRun.findFirstOrThrow({where:{userId:user.id,kind:"PUSH"}});assert.equal(run.status,"EXPIRED");assert.match(run.message!,new RegExp(String(statusCode)));
 }
});
test("repeated DST summary and tomorrow notices are sent once per local date", async () => {
 const user=await account();await prisma.user.update({where:{id:user.id},data:{timezone:"America/New_York"}});
 await prisma.notificationSettings.update({where:{userId:user.id},data:{upcoming:false,dailySummary:true,summaryTime:"01:30",dueTomorrow:true,dueTime:"01:30"}});
 await prisma.task.create({data:{userId:user.id,title:"Due",dueDate:dateOnly("2030-11-04")}});
 let sent=0;const options={userIds:[user.id],send:async()=>{sent++;return ok();}};
 await runPushNotifications(new Date("2030-11-03T05:30Z"),options);
 await runPushNotifications(new Date("2030-11-03T06:30Z"),options);assert.equal(sent,2);
});
test("duration suggestions are owned, evidence-based and do not move existing blocks", async () => {
 const user=await account(), other=await account();
 for(let i=0;i<3;i++) await prisma.event.create({data:{userId:user.id,title:"Write",status:"DONE",actualMinutes:60,startsAt:new Date(`2030-04-${10+i}T08:00Z`),endsAt:new Date(`2030-04-${10+i}T08:40Z`)}});
 // Only linked task measurements contribute.
 const task=await prisma.task.create({data:{userId:user.id,title:"Write",durationMinutes:40}});
 assert.equal((await taskDurationSuggestions(prisma,user.id)).length,0);
 await prisma.event.updateMany({where:{userId:user.id,title:"Write"},data:{taskId:task.id,source:"AUTO"}});
 assert.equal((await taskDurationSuggestions(prisma,user.id))[0].suggested,50);
 await assert.rejects(withUserLock(other.id,tx=>applyTaskDurationSuggestion(tx,other.id,task.id)),/ajuste disponible/);
 await withUserLock(user.id,tx=>applyTaskDurationSuggestion(tx,user.id,task.id));
 assert.equal((await prisma.task.findUniqueOrThrow({where:{id:task.id}})).durationMinutes,50);
 assert.equal((await prisma.event.findFirstOrThrow({where:{taskId:task.id}})).endsAt.toISOString().slice(11,16),"08:40");
});
test("push failures do not delay daily generation retries", async () => {
 const user=await account();await prisma.user.update({where:{id:user.id},data:{autoPlan:true}});
 await prisma.workerRun.create({data:{userId:user.id,kind:"PUSH",date:dateOnly("2030-04-15"),status:"FAILED",retryAt:new Date("2030-04-16T00:00Z"),attemptedAt:now}});
 const result=await runDuePlans(now,{userIds:[user.id]});assert.equal(result.generated,1);
});

test("legacy delivery keys and exhausted retries do not bypass deduplication", async () => {
 const user=await account();const block=await event(user.id);
 const sub=await prisma.pushSubscription.findFirstOrThrow({where:{userId:user.id}});
 await prisma.pushDelivery.create({data:{subscriptionId:sub.id,key:`event:${block.id}:${block.startsAt.toISOString()}:10:0`,sentAt:now,attemptedAt:now,attempts:1}});
 let sends=0;await runPushNotifications(now,{userIds:[user.id],send:async()=>{sends++;return ok();}});assert.equal(sends,0);
 const second=await account();const later=await event(second.id);
 await prisma.event.update({where:{id:later.id},data:{startsAt:new Date("2030-04-15T10:30Z"),endsAt:new Date("2030-04-15T11:00Z")}});
 await prisma.notificationSettings.update({where:{userId:second.id},data:{leadMinutes:120}});
 let attempts=0;
 for(let i=0;i<6;i++) await runPushNotifications(new Date(now.getTime()+i*180000),{userIds:[second.id],send:async()=>{attempts++;throw {statusCode:503};}});
 assert.equal(attempts,5);
 const delivery=await prisma.pushDelivery.findFirstOrThrow({where:{subscription:{userId:second.id}}});assert.equal(delivery.attempts,5);assert.match(delivery.error!,/503/);
});

test("series keep their original zone; splitting in a new zone preserves completed history", async () => {
 const {insertSeries,replaceFollowingSeries}=await import("../../src/lib/series");
 const user=await account();
 const base={userId:user.id,title:"Class",timezone:"America/New_York",frequency:"WEEKLY",weekdays:[0],startDate:dateOnly("2030-03-03"),until:dateOnly("2030-03-17"),startTime:"09:00",endTime:"10:00",endDayOffset:0};
 const series=await withUserLock(user.id,async tx=>{const s=await tx.eventSeries.create({data:base});await insertSeries(tx,s);return s;});
 const blocks=await prisma.event.findMany({where:{seriesId:series.id},orderBy:{startsAt:"asc"}});
 assert.deepEqual(blocks.map(b=>b.startsAt.toISOString()),["2030-03-03T14:00:00.000Z","2030-03-10T13:00:00.000Z","2030-03-17T13:00:00.000Z"]);
 await prisma.event.update({where:{id:blocks[0].id},data:{status:"DONE"}});
 await prisma.user.update({where:{id:user.id},data:{timezone:"Europe/Madrid"}});
 assert.equal((await prisma.eventSeries.findUniqueOrThrow({where:{id:series.id}})).timezone,"America/New_York");
 const {userId: _owner,...changed}=base; void _owner;
 const next=await withUserLock(user.id,tx=>replaceFollowingSeries(tx,user.id,blocks[1].id,{...changed,timezone:"Europe/Madrid",startDate:dateOnly("2030-03-10")}));
 assert.equal((await prisma.event.findUniqueOrThrow({where:{id:blocks[0].id}})).status,"DONE");
 assert.equal((await prisma.event.findFirstOrThrow({where:{seriesId:next.id},orderBy:{startsAt:"asc"}})).startsAt.toISOString(),"2030-03-10T08:00:00.000Z");
 const pending=await prisma.event.findFirstOrThrow({where:{seriesId:next.id},orderBy:{startsAt:"asc"}});
 await prisma.event.update({where:{id:pending.id},data:{status:"IN_PROGRESS"}});
 await assert.rejects(withUserLock(user.id,tx=>replaceFollowingSeries(tx,user.id,pending.id,changed)),/en curso/);
});

test("nonexistent and ambiguous recurrence times roll back the whole series", async () => {
 const {insertSeries}=await import("../../src/lib/series");
 for(const [start,until,time,message] of [["2030-03-09","2030-03-11","02:30",/no existe/],["2030-11-02","2030-11-04","01:30",/se repite/]] as const){
  const user=await account();
  await assert.rejects(withUserLock(user.id,async tx=>{const series=await tx.eventSeries.create({data:{userId:user.id,title:"DST",timezone:"America/New_York",frequency:"DAILY",weekdays:[],startDate:dateOnly(start),until:dateOnly(until),startTime:time,endTime:"04:00"}});await insertSeries(tx,series);}),message);
  assert.equal(await prisma.event.count({where:{userId:user.id}}),0);assert.equal(await prisma.eventSeries.count({where:{userId:user.id}}),0);
 }
});

test("learned focus places deep work while an explicit preference takes precedence", async () => {
 const user=await account();await prisma.user.update({where:{id:user.id},data:{focusWindow:"LEARNED"}});
 for(let i=0;i<12;i++) await prisma.usageSample.create({data:{userId:user.id,date:dateOnly("2030-04-14"),weekday:0,minute:720+i*15,timezone:"UTC",observedAt:new Date("2030-04-14T13:00Z")}});
 const deep=await prisma.task.create({data:{userId:user.id,title:"Deep",energy:"DEEP",durationMinutes:30}});
 const explicit=await prisma.task.create({data:{userId:user.id,title:"Explicit",energy:"DEEP",preferredWindow:"MORNING",durationMinutes:30}});
 const light=await prisma.task.create({data:{userId:user.id,title:"Light",energy:"LIGHT",durationMinutes:30}});
 await generateDay(user.id,"2030-04-15",{now:new Date("2030-04-14T20:00Z")});
 const blocks=await prisma.event.findMany({where:{userId:user.id}});
 assert.equal(blocks.find(b=>b.taskId===deep.id)!.startsAt.toISOString(),"2030-04-15T12:00:00.000Z");
 assert.match(blocks.find(b=>b.taskId===deep.id)!.planningReason!,/uso reciente/);
 assert.equal(blocks.find(b=>b.taskId===explicit.id)!.startsAt.toISOString(),"2030-04-15T08:00:00.000Z");
 assert.equal(blocks.find(b=>b.taskId===light.id)!.startsAt.toISOString(),"2030-04-15T08:40:00.000Z");
});

test("start and complete record elapsed time and reopening clears that measurement", async () => {
 const {setEventStatus}=await import("../../src/lib/calendar");
 const user=await account();const block=await event(user.id);
 await withUserLock(user.id,tx=>setEventStatus(tx,user.id,block.id,"IN_PROGRESS"));
 assert.ok((await prisma.event.findUniqueOrThrow({where:{id:block.id}})).startedAt);
 await prisma.event.update({where:{id:block.id},data:{startedAt:new Date(Date.now()-42*60000),estimatedMinutes:40}});
 await withUserLock(user.id,tx=>setEventStatus(tx,user.id,block.id,"DONE"));
 const done=await prisma.event.findUniqueOrThrow({where:{id:block.id}});assert.equal(done.actualMinutes,42);assert.equal(done.estimatedMinutes,40);
 await withUserLock(user.id,tx=>setEventStatus(tx,user.id,block.id,"PENDING"));
 const reopened=await prisma.event.findUniqueOrThrow({where:{id:block.id}});assert.equal(reopened.actualMinutes,null);assert.equal(reopened.startedAt,null);
});
