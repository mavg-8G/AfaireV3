import test from "node:test";
import assert from "node:assert/strict";
import { effectivePriority, scheduleInWindows, type Schedulable } from "../src/lib/scheduler";
import { TaskFormSchema, SettingsFormSchema } from "../src/lib/definitions";
import { analyzeLoad } from "../src/lib/capacity";
const d = (time: string) => new Date(`2030-04-15T${time}:00Z`);
const task = (extra: Partial<Schedulable> = {}): Schedulable => ({ key: "task:test", taskId: "test", title: "Task", durationMinutes: 60, priority: 2, preferredWindow: "ANY", source: "AUTO", ...extra });
const windows = [{ start: d("08:00"), end: d("08:40") }, { start: d("10:00"), end: d("10:40") }];
const policy = { planningDate: new Date("2030-04-15") };

test("splits exactly into legal chunks, avoids a short remainder, and is deterministic", () => {
  const result = scheduleInWindows(windows, [], [task({ splittable: true, minChunk: 30 })], 10);
  assert.deepEqual(result.placements.map(p => [p.item.durationMinutes,p.chunkIndex,p.chunkCount]), [[30,1,2],[30,2,2]]);
  assert.equal(result.skipped.length, 0);
  assert.deepEqual(result, scheduleInWindows(windows, [], [task({ splittable: true, minChunk: 30 })], 10));
});
test("a contiguous slot wins; splitting requires explicit opt-in even for deep tasks", () => {
  assert.equal(scheduleInWindows(windows, [], [task({ energy: "DEEP" })], 0).placements.length, 0);
  const result = scheduleInWindows([{ start:d("08:00"),end:d("10:00") }], [], [task({ splittable:true })], 0);
  assert.equal(result.placements.length, 1); assert.equal(result.placements[0].chunkIndex, undefined);
});
test("failed fragmentation is atomic and smaller work can still use the gaps", () => {
  const result = scheduleInWindows(windows, [], [task({ splittable:true, minChunk:30, durationMinutes:45 }), task({ key:"small",taskId:"small",durationMinutes:20,priority:3 })], 0);
  assert.equal(result.failures["task:test"], "MIN_CHUNK_UNAVAILABLE");
  assert.deepEqual(result.placements.map(p => p.item.key), ["small"]);
});
test("fragments account for capacity, buffers, travel and recovery", () => {
  const result = scheduleInWindows(windows, [], [task({ splittable:true,minChunk:30 })], 10, { maxMinutes:65 });
  assert.equal(result.placements.length,0); assert.equal(result.failures["task:test"],"CAPACITY_EXCEEDED");
  const busy = [{startsAt:d("08:40"),endsAt:d("09:50"),travelMinutes:10,recoveryMinutes:10}];
  const split = scheduleInWindows([{start:d("08:00"),end:d("10:40")}], busy, [task({splittable:true,minChunk:20})], 0);
  assert.equal(split.placements.reduce((n,p)=>n+p.item.durationMinutes,0),60);
  assert.ok(split.placements.every(p=>p.item.durationMinutes>=20));
  assert.ok(split.placements[0].endsAt <= d("08:30"));
  assert.ok(split.placements[1].startsAt >= d("10:00"));
  const recovery = scheduleInWindows(windows, [], [task({splittable:true,minChunk:30})], 0, {maxMinutes:65,longBlockMinutes:30,recoveryMinutes:10});
  assert.equal(recovery.placements.length,0);
});
test("urgency promotes deadlines while essential habits stay first; configuration can disable it", () => {
  const tomorrow = task({key:"due",taskId:"due",priority:3,dueDate:new Date("2030-04-16"),durationMinutes:30});
  const high = task({key:"high",taskId:"high",priority:1,durationMinutes:30});
  const w = [{start:d("08:00"),end:d("08:30")}];
  assert.equal(scheduleInWindows(w,[],[high,tomorrow],0,policy).placements[0].item.key,"due");
  assert.equal(scheduleInWindows(w,[],[high,tomorrow],0,{...policy,urgencyEnabled:false}).placements[0].item.key,"high");
  assert.equal(effectivePriority({...tomorrow,dueDate:new Date("2030-04-18")},policy),2);
  assert.equal(effectivePriority({...tomorrow,dueDate:new Date("2030-04-14")},policy),1);
  assert.equal(effectivePriority(tomorrow,{...policy,urgencyNearDays:0,urgencySoonDays:0}),3);
  assert.equal(scheduleInWindows(w,[],[tomorrow,task({key:"essential",required:true,priority:3,durationMinutes:30})],0,policy).placements[0].item.key,"essential");
  assert.match(scheduleInWindows(w,[],[tomorrow],0,policy).placements[0].reason,/base 3, efectiva 1/);
});
test("fragment allocation leaves enough room for recovery between nearby windows", () => {
  const nearby=[{start:d("08:00"),end:d("09:40")},{start:d("09:45"),end:d("11:05")}];
  const result=scheduleInWindows(nearby,[],[task({durationMinutes:150,splittable:true,minChunk:30})],10,{longBlockMinutes:90,recoveryMinutes:30});
  assert.equal(result.skipped.length,0);
  assert.equal(result.placements.reduce((n,p)=>n+p.item.durationMinutes,0),150);
  assert.ok(result.placements[1].startsAt.getTime()-result.placements[0].endsAt.getTime()>=(10+result.placements[0].recoveryMinutes)*60000);
});
test("task defaults preserve focus and fragment inputs are validated", () => {
  const input = {title:"Deep",durationMinutes:60,priority:2,preferredWindow:"ANY",energy:"DEEP"};
  assert.equal(TaskFormSchema.parse(input).splittable,false);
  assert.equal(TaskFormSchema.parse({...input,splittable:"on"}).splittable,true);
  assert.equal(TaskFormSchema.safeParse({...input,minChunk:4}).success,false);
  const settings = {name:"Test",timezone:"UTC",dayStart:"08:00",dayEnd:"18:00",bufferMinutes:0,autoPlan:false,carryOver:true,adaptiveAvailability:false,availability:Array.from({length:7},(_,weekday)=>({weekday,active:true,start:"08:00",end:"18:00"}))};
  assert.equal(SettingsFormSchema.safeParse({...settings,urgencySoonDays:1,urgencyNearDays:3}).success,false);
});
test("capacity warnings distinguish fragmentable work from a missing continuous slot", () => {
  const days=[{day:"2030-04-15",minutes:80,maxGap:40,habitMinutes:0,freeGaps:[40,40]}];
  const task={id:"test",title:"Task",durationMinutes:60,availableFrom:null,dueDate:"2030-04-15"};
  assert.equal(analyzeLoad(days,[{...task,splittable:true,minChunk:30}],"2030-04-15").risks.length,0);
  assert.equal(analyzeLoad(days,[task],"2030-04-15").risks.length,1);
  assert.equal(analyzeLoad(days,[{...task,splittable:true,minChunk:35}],"2030-04-15").risks.length,1);
});
