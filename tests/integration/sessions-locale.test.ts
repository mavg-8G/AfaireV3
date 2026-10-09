import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { withUserLock } from "../../src/lib/transaction";
import { createDeviceSession, validDeviceSession, revokeDevices, revokeOnLogout } from "../../src/lib/device-sessions";
import { runPushNotifications } from "../../src/lib/push";
import { generateDay } from "../../src/lib/planner";
import { createTemplateWeek } from "../../src/lib/planning-templates";
import { dateOnly } from "../../src/lib/time";
const ids:string[]=[], now=new Date("2030-04-20T12:00Z");
async function account(){const u=await prisma.user.create({data:{email:randomUUID()+"@test.invalid",name:"Sessions",passwordHash:"unused",timezone:"UTC",dayStart:"08:00",dayEnd:"12:00",onboardingCompleted:true}});ids.push(u.id);return u;}
const device=(userId:string)=>withUserLock(userId,tx=>createDeviceSession(tx,userId,"Windows Firefox/120",now));
const subscription=(userId:string,deviceSessionId:string|null)=>prisma.pushSubscription.create({data:{userId,deviceSessionId,endpoint:"https://fcm.googleapis.com/"+randomUUID(),p256dh:"unused",auth:"unused",sessionVersion:0}});
after(async()=>{for(const userId of ids){await prisma.event.deleteMany({where:{userId}});await prisma.habitOccurrence.deleteMany({where:{userId}});await prisma.user.delete({where:{id:userId}});}await prisma.$disconnect();});
test("sessions enforce ownership and close others without affecting current device or another account",async()=>{
 const u=await account(),other=await account(),a=await device(u.id),b=await device(u.id),foreign=await device(other.id);
 const ownPush=await subscription(u.id,a.id),otherPush=await subscription(other.id,foreign.id);await subscription(u.id,b.id);await subscription(u.id,null);
 await assert.rejects(withUserLock(u.id,tx=>revokeDevices(tx,u.id,a.id,foreign.id,now)),/no encontrada/);
 assert.equal(await validDeviceSession(other.id,foreign.id,0,now),true);
 await withUserLock(u.id,tx=>revokeDevices(tx,u.id,a.id,"OTHERS",now));
 assert.equal(await validDeviceSession(u.id,a.id,0,now),true);assert.equal(await validDeviceSession(u.id,b.id,0,now),false);
 assert.deepEqual((await prisma.pushSubscription.findMany({where:{userId:u.id}})).map(p=>p.id),[ownPush.id]);assert.ok(await prisma.pushSubscription.findUnique({where:{id:otherPush.id}}));
});
test("logout revokes the individual session and push; revoked sessions cannot revoke other devices",async()=>{
 const u=await account(),a=await device(u.id),b=await device(u.id);await subscription(u.id,a.id);
 await revokeOnLogout(u.id,a.id);
 assert.equal(await validDeviceSession(u.id,a.id,0,now),false);assert.equal(await validDeviceSession(u.id,b.id,0,now),true);assert.equal(await prisma.pushSubscription.count({where:{userId:u.id}}),0);
 await assert.rejects(withUserLock(u.id,tx=>revokeDevices(tx,u.id,a.id,b.id,now)),/caducó/);
});
test("session expiry and password version invalidate access, with throttled activity updates",async()=>{
 const u=await account(),a=await device(u.id);assert.equal(await validDeviceSession(u.id,undefined,0,now),false);
 await validDeviceSession(u.id,a.id,0,new Date(now.getTime()+60_000));assert.equal((await prisma.deviceSession.findUniqueOrThrow({where:{id:a.id}})).lastSeenAt.getTime(),now.getTime());
 const later=new Date(now.getTime()+360_000);assert.equal(await validDeviceSession(u.id,a.id,0,later),true);assert.equal((await prisma.deviceSession.findUniqueOrThrow({where:{id:a.id}})).lastSeenAt.getTime(),later.getTime());
 assert.equal(await validDeviceSession(u.id,a.id,0,a.expiresAt),false);
 await prisma.user.update({where:{id:u.id},data:{sessionVersion:1}});assert.equal(await validDeviceSession(u.id,a.id,0,now),false);
});
test("expired linked sessions cannot send push notifications even when a candidate was selected",async()=>{
 const u=await account(),a=await device(u.id);await subscription(u.id,a.id);await prisma.deviceSession.update({where:{id:a.id},data:{expiresAt:new Date("2030-04-21T07:00Z")}});
 await prisma.notificationSettings.create({data:{userId:u.id}});await prisma.event.create({data:{userId:u.id,title:"Private",startsAt:new Date("2030-04-21T08:05Z"),endsAt:new Date("2030-04-21T08:30Z")}});
 let sent=0;await runPushNotifications(new Date("2030-04-21T08:00Z"),{userIds:[u.id],send:async()=>{sent++;return {statusCode:201,body:"",headers:{}};}});assert.equal(sent,0);assert.equal(await prisma.pushSubscription.count({where:{userId:u.id}}),0);
});
test("Sunday starts a new weekly habit quota while Monday retains Saturday's completion",async()=>{
 for(const weekStartsOn of [0,1]){const u=await account();await prisma.user.update({where:{id:u.id},data:{weekStartsOn}});const habit=await prisma.habit.create({data:{userId:u.id,title:"Weekly",durationMinutes:20,daysOfWeek:[],frequencyMode:"WEEKLY",weeklyTarget:1}});await prisma.habitOccurrence.create({data:{userId:u.id,habitId:habit.id,date:dateOnly("2030-04-20"),status:"DONE"}});await generateDay(u.id,"2030-04-21",{now});assert.equal(await prisma.event.count({where:{userId:u.id,habitId:habit.id}}),weekStartsOn===0?1:0);}
});
test("Sunday week templates preserve weekday work and weekend pause without changing base hours",async()=>{
 const u=await account();await prisma.user.update({where:{id:u.id},data:{weekStartsOn:0}});await withUserLock(u.id,tx=>createTemplateWeek(tx,u.id,"mornings","2030-04-21",now));const rows=await prisma.dayOverride.findMany({where:{userId:u.id},orderBy:{date:"asc"}});assert.equal(rows.length,7);assert.equal(rows[0].paused,true);assert.equal(rows[1].startTime,"08:00");assert.equal(rows[6].paused,true);assert.equal((await prisma.user.findUniqueOrThrow({where:{id:u.id}})).weekStartsOn,0);
});

test("changing week preferences releases future flexible weekly habits but preserves completed history",async()=>{
 const {updateRegionalPreferences}=await import("../../src/lib/profile-preferences");const u=await account();const habit=await prisma.habit.create({data:{userId:u.id,title:"Weekly",durationMinutes:20,daysOfWeek:[],frequencyMode:"WEEKLY",weeklyTarget:3}});
 const occurrence=await prisma.habitOccurrence.create({data:{userId:u.id,habitId:habit.id,date:dateOnly("2030-04-22")}});await prisma.event.create({data:{userId:u.id,habitId:habit.id,occurrenceId:occurrence.id,title:"Future",source:"HABIT",locked:false,planningDate:dateOnly("2030-04-22"),startsAt:new Date("2030-04-22T08:00Z"),endsAt:new Date("2030-04-22T08:20Z")}});
 const doneOccurrence=await prisma.habitOccurrence.create({data:{userId:u.id,habitId:habit.id,date:dateOnly("2030-04-19"),status:"DONE"}});const done=await prisma.event.create({data:{userId:u.id,habitId:habit.id,occurrenceId:doneOccurrence.id,planningDate:dateOnly("2030-04-19"),title:"Done",source:"HABIT",locked:false,status:"DONE",startsAt:new Date("2030-04-19T08:00Z"),endsAt:new Date("2030-04-19T08:20Z")}});await prisma.dayPlan.create({data:{userId:u.id,date:dateOnly("2030-04-22")}});
 await withUserLock(u.id,tx=>updateRegionalPreferences(tx,u.id,{locale:"en",hourFormat:"12",weekStartsOn:0},now));
 assert.equal(await prisma.event.count({where:{userId:u.id,status:"PENDING"}}),0);assert.ok(await prisma.event.findUnique({where:{id:done.id}}));assert.equal(await prisma.dayPlan.count({where:{userId:u.id}}),0);assert.equal((await prisma.user.findUniqueOrThrow({where:{id:u.id}})).locale,"en");
});
