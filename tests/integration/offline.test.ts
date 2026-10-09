import "dotenv/config";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { withUserLock } from "../../src/lib/transaction";
import { applyOfflineChange, OfflineChangeSchema, type OfflineChange } from "../../src/lib/offline-mutations";
const now = new Date("2030-04-15T08:00Z"), ids: string[] = [];
async function fixture() {
  const user = await prisma.user.create({data:{email:randomUUID()+"@offline.test.invalid",name:"Offline",passwordHash:"unused",timezone:"UTC"}});ids.push(user.id);
  const device = await prisma.deviceSession.create({data:{id:randomUUID(),userId:user.id,label:"Test",expiresAt:new Date(now.getTime()+7*86400_000)}});
  const task = await prisma.task.create({data:{userId:user.id,title:"Task",durationMinutes:60,status:"SCHEDULED"}});
  const event = await prisma.event.create({data:{userId:user.id,title:"Task",source:"AUTO",taskId:task.id,startsAt:new Date("2030-04-15T09:00Z"),endsAt:new Date("2030-04-15T10:00Z"),estimatedMinutes:60}});
  const actor = {id:user.id,currentSessionId:device.id,sessionVersion:user.sessionVersion};
  const command = (overrides: Record<string,unknown> = {}) => {
    const input: Record<string,unknown> = {id:randomUUID(),owner:user.id,deviceSessionId:device.id,sessionVersion:0,eventId:event.id,expectedUpdatedAt:event.updatedAt.toISOString(),recordedAt:now.toISOString(),timezone:"UTC",kind:"STATUS",status:"DONE",...overrides};
    if(input.kind==="EDIT")delete input.status;
    return OfflineChangeSchema.parse(input);
  };
  const apply = (change: OfflineChange, at = now) => withUserLock(user.id,tx=>applyOfflineChange(tx,actor,change,at));
  return {user,device,task,event,actor,command,apply};
}
after(async()=>{for(const userId of ids){await prisma.event.deleteMany({where:{userId}});await prisma.habitOccurrence.deleteMany({where:{userId}});await prisma.user.delete({where:{id:userId}});}await prisma.$disconnect();});
test("offline retries and concurrent copies apply exactly once and refuse reusing an id",async()=>{
  const f=await fixture(),change=f.command();
  const results=await Promise.all([f.apply(change),f.apply(change)]);
  assert.equal(results.filter(r=>r.duplicate).length,1);assert.equal(results[0].updatedAt,results[1].updatedAt);
  assert.equal(await prisma.offlineMutation.count({where:{userId:f.user.id}}),1);
  assert.equal((await prisma.task.findUniqueOrThrow({where:{id:f.task.id}})).status,"DONE");
  await assert.rejects(f.apply({...change,status:"PENDING"} as OfflineChange),/identificador/);
});
test("offline start and completion use recorded times even when delivered later",async()=>{
  const f=await fixture();
  const start=await f.apply(f.command({status:"IN_PROGRESS"}),new Date("2030-04-15T11:00Z"));
  const completedAt=new Date("2030-04-15T08:35Z");
  await f.apply(f.command({expectedUpdatedAt:start.updatedAt,recordedAt:completedAt.toISOString()}),new Date("2030-04-15T11:00Z"));
  const event=await prisma.event.findUniqueOrThrow({where:{id:f.event.id}});
  assert.equal(event.actualMinutes,35);assert.equal(event.startedAt!.toISOString(),now.toISOString());
});
test("offline stale revisions cannot overwrite a concurrent edit and a missing block is not recreated",async()=>{
  const f=await fixture(),change=f.command();await prisma.event.update({where:{id:f.event.id},data:{title:"Changed elsewhere",updatedAt:new Date(f.event.updatedAt.getTime()+1000)}});
  await assert.rejects(f.apply(change),/cambió/);
  assert.equal((await prisma.event.findUniqueOrThrow({where:{id:f.event.id}})).status,"PENDING");
  assert.equal(await prisma.offlineMutation.count({where:{userId:f.user.id}}),0);
  await prisma.event.delete({where:{id:f.event.id}});await assert.rejects(f.apply(change),/no encontrado/);
});
test("offline queues cannot cross accounts or sessions, or outlive revocation",async()=>{
  const f=await fixture(),other=await fixture();
  await assert.rejects(f.apply(f.command({owner:other.user.id})),/otra sesión/);
  await assert.rejects(f.apply(f.command({deviceSessionId:randomUUID()})),/otra sesión/);
  await assert.rejects(f.apply(f.command({eventId:other.event.id})),/no encontrado/);
  await prisma.deviceSession.update({where:{id:f.device.id},data:{revokedAt:now}});
  await assert.rejects(f.apply(f.command()),/caducó/);
});
test("offline time edits enforce fixed time, collisions, timezone and elapsed slots atomically",async()=>{
  const f=await fixture();const edit={title:"Moved offline",date:"2030-04-15",endDate:"2030-04-15",startTime:"10:00",endTime:"11:00",notes:"Notes",location:"Home",travelMinutes:10};
  await prisma.event.create({data:{userId:f.user.id,title:"Appointment",startsAt:new Date("2030-04-15T10:00Z"),endsAt:new Date("2030-04-15T11:00Z")}});
  await assert.rejects(f.apply(f.command({kind:"EDIT",edit,status:undefined})),/coincide/);
  const good=f.command({kind:"EDIT",status:undefined,edit:{...edit,startTime:"11:30",endTime:"12:00"}});
  await f.apply(good);
  const event=await prisma.event.findUniqueOrThrow({where:{id:f.event.id}});assert.equal(event.locked,true);assert.equal(event.notes,"Notes");assert.equal(event.title,"Moved offline");
  const elapsed=f.command({kind:"EDIT",status:undefined,expectedUpdatedAt:event.updatedAt.toISOString(),edit:{...edit,startTime:"07:00",endTime:"07:30"}});
  await assert.rejects(f.apply(elapsed),/ya pasó/);
  await assert.rejects(f.apply({...elapsed,timezone:"America/Guayaquil"}),/zona horaria/);
  assert.equal((await prisma.event.findUniqueOrThrow({where:{id:f.event.id}})).startsAt.toISOString(),"2030-04-15T11:30:00.000Z");
});
test("offline rejects stale or future clocks and cannot reopen a removed block",async()=>{
  const f=await fixture();
  await assert.rejects(f.apply(f.command({recordedAt:new Date(now.getTime()-8*86400_000).toISOString()})),/antiguo/);
  await assert.rejects(f.apply(f.command({recordedAt:new Date(now.getTime()+61000).toISOString()})),/reloj/);
  await f.apply(f.command({status:"CANCELLED"}));const event=await prisma.event.findUniqueOrThrow({where:{id:f.event.id}});
  await assert.rejects(f.apply(f.command({status:"PENDING",expectedUpdatedAt:event.updatedAt.toISOString()})),/retirado/);
});
