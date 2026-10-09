import test from "node:test";
import assert from "node:assert/strict";
import type { Event, PlanFeedback } from "../src/generated/prisma/client";
import { stateHash } from "../src/lib/plan-history";
import { feedbackPolicy, feedbackDuration } from "../src/lib/plan-feedback";
import { scheduleInWindows, type Schedulable } from "../src/lib/scheduler";
import { categoryMinutes } from "../src/lib/category-budgets";
import { calendarDayBounds, addLocalDays, startOfLocalWeek } from "../src/lib/time";
function signal(date:string,reason:string,values:Partial<PlanFeedback>={}):PlanFeedback{return {id:date+reason,userId:"u",source:"EXPLICIT",date:new Date(date+"T00:00Z"),reason,preferredWindow:null,taskId:null,habitId:null,suggestedMinutes:null,updatedAt:new Date(date+"T12:00Z"),...values};}
test("history hashes survive JSONB property order and timestamp serialization",()=>{const a={second:{z:1,a:new Date("2030-04-15T00:00Z")},first:[1,2]};assert.equal(stateHash(a),stateHash({first:[1,2],second:{a:"2030-04-15T00:00:00.000Z",z:1}}));assert.notEqual(stateHash([1,2]),stateHash([2,1]));});
test("explicit signals deduplicate days, cap slack, prefer the latest time and bound estimate corrections",()=>{
 const rows=Array.from({length:8},(_,i)=>signal(`2030-04-${String(i+10).padStart(2,"0")}`,"OVERLOADED"));rows.push(rows[0],signal("2030-04-17","BAD_TIME",{preferredWindow:"EVENING"}),signal("2030-04-18","BAD_TIME",{preferredWindow:"AFTERNOON"}));
 assert.deepEqual(feedbackPolicy(rows),{extraSlack:20,preferredWindow:"AFTERNOON"});assert.equal(feedbackDuration(40,[signal("2030-04-18","ESTIMATE",{taskId:"t",suggestedMinutes:100})],"t"),50);assert.equal(feedbackDuration(40,[signal("2030-04-18","ESTIMATE",{taskId:"other",suggestedMinutes:100})],"t"),40);assert.equal(feedbackDuration(50,[signal("2030-04-18","ESTIMATE",{taskId:"t",suggestedMinutes:100})],"t",undefined,40),50);
});
test("weekly category accounting clips overnight blocks using real DST week boundaries and actual time",()=>{
 for(const [day,length] of [["2030-03-10",23],["2030-11-03",25]] as const){const bounds=calendarDayBounds(day,"America/New_York");assert.equal((bounds.end.getTime()-bounds.start.getTime())/3600000,length);const event={startsAt:bounds.start,endsAt:bounds.end,status:"DONE",actualMinutes:90} as Event;assert.equal(categoryMinutes(event,bounds.start,bounds.end),90);assert.equal(categoryMinutes({...event,status:"PENDING"},bounds.start,bounds.end),length*60);}
 assert.equal(startOfLocalWeek("2030-04-17",0),"2030-04-14");assert.equal(addLocalDays(startOfLocalWeek("2030-04-17",1),6),"2030-04-21");
});
test("category reservations use small gaps, stop at the weekly allowance and protect urgent tasks",()=>{
 const start=new Date("2030-04-15T08:00Z"),end=new Date("2030-04-15T09:00Z");
 const items:Schedulable[]=[{key:"urgent",title:"Urgent",durationMinutes:15,priority:1,preferredWindow:"ANY",source:"AUTO"},{key:"study",title:"Study",durationMinutes:60,priority:2,preferredWindow:"ANY",source:"AUTO",categoryId:"study",categoryWeight:1,budgetFill:true}];
 const result=scheduleInWindows([{start,end}],[],items,0,{categoryFillLimits:{study:30},maxMinutes:45});assert.equal(result.placements[0].item.key,"urgent");assert.equal(result.placements.filter(p=>p.item.categoryId==="study").reduce((n,p)=>n+p.item.durationMinutes,0),30);
 const fragmented=scheduleInWindows([{start,end}], [{startsAt:new Date("2030-04-15T08:20Z"),endsAt:new Date("2030-04-15T08:40Z")}],[items[1]],0,{categoryFillLimits:{study:35}});assert.equal(fragmented.placements.reduce((n,p)=>n+p.item.durationMinutes,0),35);
});
