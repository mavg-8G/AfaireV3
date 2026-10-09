import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduleInWindows, freeMinutes, type Schedulable } from "../src/lib/scheduler";
import { taskPeriods } from "../src/lib/task-series";
import { dateOnly } from "../src/lib/time";
import { chooseWeeklyDays } from "../src/lib/weekly-habits";
import { analyzeLoad } from "../src/lib/capacity";
import { habitStats } from "../src/lib/insights";
const window={start:new Date("2030-04-15T08:00Z"),end:new Date("2030-04-15T12:00Z")};
const item=(key:string,durationMinutes=60):Schedulable=>({key,title:key,durationMinutes,priority:2,preferredWindow:"ANY",source:"AUTO"});
test("slack budgets account for real occupied time and do not erase exact fits at boundaries",()=>{
 const result=scheduleInWindows([window],[],[item("a"),item("b"),item("c"),item("d")],10,{maxMinutes:192});
 assert.equal(result.placements.length,2);
 assert.ok(freeMinutes([window],result.placements,10)>=48);
 const exact=scheduleInWindows([{start:window.start,end:new Date("2030-04-15T09:00Z")}],[],[item("exact")],10,{maxMinutes:60});assert.equal(exact.placements.length,1);
});
test("long block recovery is added only after long blocks and protected on replanning",()=>{
 const result=scheduleInWindows([window],[],[item("long",90),item("short",30)],10,{longBlockMinutes:90,recoveryMinutes:20});
 assert.equal(result.placements[0].recoveryMinutes,20);assert.equal(result.placements[1].recoveryMinutes,0);
 assert.equal(result.placements[1].startsAt.toISOString(),"2030-04-15T10:00:00.000Z");
 assert.match(result.placements[0].reason,/20 min adicionales/);
 const gaps=freeMinutes([window],[result.placements[0]],10);assert.equal(gaps,120);
});
test("monthly task periods clamp missing days while weekly windows retain local dates",()=>{
 const monthly={frequency:"MONTHLY",anchorDate:dateOnly("2028-01-31"),windowDays:3};
 assert.deepEqual(taskPeriods(monthly,"2028-01-31","2028-03-31").map(p=>p.periodStart.toISOString().slice(0,10)),["2028-01-31","2028-02-29","2028-03-31"]);
 assert.deepEqual(taskPeriods({...monthly,frequency:"WEEKLY",anchorDate:dateOnly("2030-04-12"),windowDays:7},"2030-04-15","2030-04-26").map(p=>p.periodStart.toISOString().slice(0,10)),["2030-04-12","2030-04-19","2030-04-26"]);
});
test("weekly flexible habits choose best days with deterministic ties and respect existing quota",()=>{
 const candidates=[{day:"2030-04-15",minutes:60,fits:true},{day:"2030-04-16",minutes:240,fits:true},{day:"2030-04-17",minutes:240,fits:true},{day:"2030-04-18",minutes:500,fits:false}];
 assert.deepEqual(chooseWeeklyDays(3,["2030-04-14"],candidates),["2030-04-16","2030-04-17"]);
 assert.deepEqual(chooseWeeklyDays(1,["2030-04-14"],candidates),[]);
});
test("overload and deadline risk use release dates and continuous capacity",()=>{
 const days=[{day:"2030-04-15",minutes:120,maxGap:60,habitMinutes:0},{day:"2030-04-16",minutes:30,maxGap:30,habitMinutes:0}];
 const tasks=[{id:"a",title:"Large",durationMinutes:90,availableFrom:null,dueDate:"2030-04-15"},{id:"b",title:"Later",durationMinutes:60,availableFrom:"2030-04-16",dueDate:"2030-04-16"},{id:"c",title:"Future",durationMinutes:480,availableFrom:"2030-04-20",dueDate:null}];
 const result=analyzeLoad(days,tasks,"2030-04-15");assert.equal(result.taskMinutes,150);assert.equal(result.overloaded,false);assert.equal(result.risks.length,2);
 assert.match(result.risks[0].reason,/continuo/);assert.match(result.risks[1].reason,/continuo/);
 const overloaded=analyzeLoad(days,[...tasks,{id:"d",title:"Extra",durationMinutes:30,availableFrom:null,dueDate:null}],"2030-04-15");assert.equal(overloaded.overloaded,true);
});
test("frequency habit statistics count consecutive successful weeks without fixed weekdays",()=>{
 const completed=new Set(["2030-04-02","2030-04-03","2030-04-05","2030-04-09","2030-04-10","2030-04-12"]);
 const stats=habitStats([],"2030-04-15","2030-04-17","2030-04-01",completed,"2030-04-17",3);
 assert.deepEqual(stats,{expected:3,done:0,streak:2});
});
