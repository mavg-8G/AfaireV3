import test from "node:test";
import assert from "node:assert/strict";
import { taskMeasurements, validDurationMeasurements, type DurationMeasurement } from "../src/lib/duration-learning";
import { adjustedDuration, durationEvidence } from "../src/lib/insights";
import { TaskFormSchema } from "../src/lib/definitions";
import { scheduleItems, type Schedulable } from "../src/lib/scheduler";
const task = { title: "Report", categoryId: "work", learningMatch: "TITLE", learningKey: null as string | null };
const measurement = (actualMinutes: number, estimate = 100, extra: Partial<DurationMeasurement> = {}): DurationMeasurement => ({ title: " Report ", taskId: "old", task, actualMinutes, estimatedMinutes: estimate, startsAt: new Date("2030-04-15T08:00Z"), endsAt: new Date("2030-04-15T09:40Z"), chunkIndex: null, ...extra });
test("rejects accidental completions below 10%, comparing each historical estimate and including the boundary", () => {
  const history = [measurement(1), measurement(9), measurement(10), measurement(35), measurement(35), measurement(35), measurement(8, 50), measurement(0), measurement(NaN), measurement(481), measurement(35,100,{chunkIndex:1})];
  assert.deepEqual(taskMeasurements(task, history), [10,35,35,35,8]);
  assert.deepEqual(durationEvidence(taskMeasurements(task, history)), { samples: 5, median: 35 });
  assert.equal(adjustedDuration(40, taskMeasurements(task, history)), 35);
  assert.equal(validDurationMeasurements([measurement(9,100,{estimatedMinutes:null})]).length, 0);
  assert.equal(validDurationMeasurements([measurement(10,100,{estimatedMinutes:null})]).length, 1);
});
test("explicit template matching shares evidence across titles and keeps distinct templates apart", () => {
  const template = { ...task, learningMatch: "TEMPLATE", learningKey: "Weekly report" };
  const history = [measurement(35,100,{title:"Monday",task:{...template,learningKey:" weekly REPORT "}}),measurement(40,100,{task:{...template,learningKey:"Other"}}),measurement(45)];
  assert.deepEqual(taskMeasurements(template,history),[35]);
  assert.deepEqual(taskMeasurements(task,history),[45]);
});
test("category matching is explicit, uses task history only and cannot match a null category", () => {
  const history = [measurement(35),measurement(40,100,{task:{...task,title:"Different"}}),measurement(45,100,{task:{...task,categoryId:"other"}}),measurement(50,100,{taskId:null,task:null,habitId:"habit"})];
  assert.deepEqual(taskMeasurements({...task,learningMatch:"CATEGORY"},history),[35,40]);
  assert.deepEqual(taskMeasurements({...task,learningMatch:"CATEGORY",categoryId:null},history),[]);
});
test("requires three valid measurements and shows count and median in automatic plan reasons", () => {
  assert.equal(durationEvidence([35,35]),undefined);
  const item: Schedulable = {key:"task:t",title:"Report",durationMinutes:35,originalMinutes:40,durationEvidence:{samples:4,median:35},priority:2,preferredWindow:"ANY",source:"AUTO"};
  const result = scheduleItems(new Date("2030-04-15T08:00Z"),new Date("2030-04-15T10:00Z"),[],[item],0);
  assert.match(result.placements[0].reason,/Basado en 4 mediciones, mediana 35 min/);
});
test("validates explicit learning links", () => {
  const input = {title:"Report",durationMinutes:40,priority:2,preferredWindow:"ANY"};
  assert.equal(TaskFormSchema.safeParse({...input,learningMatch:"TEMPLATE",learningKey:"  "}).success,false);
  assert.equal(TaskFormSchema.safeParse({...input,learningMatch:"CATEGORY"}).success,false);
  assert.equal(TaskFormSchema.parse({...input,learningMatch:"TEMPLATE",learningKey:" Weekly "}).learningKey,"Weekly");
});
