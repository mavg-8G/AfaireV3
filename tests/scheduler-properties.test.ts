import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { scheduleInWindows, type Schedulable, type Busy } from "../src/lib/scheduler";
const instant = (minute: number) => new Date(Date.UTC(2030,3,15,0,minute));
const scenario = fc.record({
  now: fc.integer({min:0,max:1440}), buffer: fc.integer({min:0,max:30}), recovery: fc.integer({min:0,max:30}),
  busy: fc.array(fc.record({start:fc.integer({min:-120,max:1440}),length:fc.integer({min:1,max:180}),travel:fc.integer({min:0,max:60})}),{maxLength:10}),
  tasks: fc.array(fc.record({minutes:fc.integer({min:1,max:96}).map(n=>n*5),priority:fc.integer({min:1,max:3}),splittable:fc.boolean(),minimum:fc.integer({min:1,max:12}).map(n=>n*5),preferred:fc.integer({min:0,max:1440})}),{maxLength:20}),
}).map(input => {
  const busy: Busy[] = input.busy.map(row=>({startsAt:instant(row.start),endsAt:instant(row.start+row.length),travelMinutes:row.travel}));
  const items: Schedulable[] = input.tasks.map((row,i)=>({key:`task:${i}`,taskId:String(i),title:String(i),durationMinutes:row.minutes,priority:row.priority,splittable:row.splittable,minChunk:row.minimum,preferredWindow:"ANY",preferred:{start:instant(row.preferred),end:instant(row.preferred+120)},source:"AUTO"}));
  return {windows:[{start:instant(Math.max(480,input.now)),end:instant(720)},{start:instant(Math.max(780,input.now)),end:instant(1320)}].filter(w=>w.end>w.start),busy,items,buffer:input.buffer,policy:{recoveryMinutes:input.recovery,longBlockMinutes:90},now:instant(input.now)};
});
const options = {numRuns:500,seed:20261009};
test("property: generated blocks never overlap each other, appointments or travel",()=>fc.assert(fc.property(scenario,s=>{
  const result=scheduleInWindows(s.windows,s.busy,s.items,s.buffer,s.policy);
  for(const [i,a] of result.placements.entries()) {
    assert.ok(a.endsAt>a.startsAt);
    for(const b of result.placements.slice(i+1))assert.ok(a.endsAt<=b.startsAt||b.endsAt<=a.startsAt);
    for(const b of s.busy)assert.ok(a.endsAt.getTime()<=b.startsAt.getTime()-b.travelMinutes!*60000||a.startsAt>=b.endsAt);
  }
}),options));
test("property: generated blocks stay inside remaining availability and never start in the past",()=>fc.assert(fc.property(scenario,s=>{
  const result=scheduleInWindows(s.windows,s.busy,s.items,s.buffer,s.policy);
  for(const p of result.placements){assert.ok(p.startsAt>=s.now);assert.ok(s.windows.some(w=>p.startsAt>=w.start&&p.endsAt<=w.end));}
}),options));
test("property: identical inputs and permutations of task inputs produce identical output",()=>fc.assert(fc.property(scenario,s=>{
  const run=(items:Schedulable[])=>scheduleInWindows(s.windows,s.busy,items,s.buffer,s.policy);
  assert.deepEqual(run(s.items),run(structuredClone(s.items)));
  assert.deepEqual(run(s.items),run([...s.items].reverse()));
}),options));
test("property: fixed blocks and input objects are never moved or mutated",()=>fc.assert(fc.property(scenario,s=>{
  const before=structuredClone(s);
  scheduleInWindows(s.windows,s.busy,s.items,s.buffer,s.policy);
  assert.deepEqual(s,before);
}),options));
