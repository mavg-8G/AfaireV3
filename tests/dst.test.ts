import test from "node:test";
import assert from "node:assert/strict";
import { addLocalDays, calendarDayBounds, combineLocalDateTime } from "../src/lib/time";
import { parseEvent } from "../src/lib/calendar";
import { recurrenceInstances } from "../src/lib/recurrence";
import { scheduleInWindows, type Schedulable } from "../src/lib/scheduler";
const cases = [
  {zone:"America/New_York",spring:"2026-03-08",fall:"2026-11-01",missing:"02:30",repeated:"01:30",delta:1},
  {zone:"Europe/Madrid",spring:"2026-03-29",fall:"2026-10-25",missing:"02:30",repeated:"02:30",delta:1},
  {zone:"Australia/Lord_Howe",spring:"2026-10-04",fall:"2026-04-05",missing:"02:15",repeated:"01:45",delta:.5},
];
for(const c of cases) {
  test(`DST ${c.zone}: real day lengths and nonexistent/repeated local times`,()=>{
    for(const [day,hours] of [[c.spring,24-c.delta],[c.fall,24+c.delta]] as const){const b=calendarDayBounds(day,c.zone);assert.equal((b.end.getTime()-b.start.getTime())/3600000,hours);}
    assert.throws(()=>combineLocalDateTime(c.spring,c.missing,c.zone),/no existe/);
    assert.throws(()=>combineLocalDateTime(c.fall,c.repeated,c.zone),/se repite/);
  });
  for(const [day,expected] of [[c.spring,5-c.delta],[c.fall,5+c.delta]] as const) test(`DST ${c.zone} ${day}: overnight appointments and recurrence preserve elapsed time and block planning`,()=>{
    const previous=addLocalDays(day,-1);
    const form=new FormData();for(const [key,value] of Object.entries({title:"Overnight",date:previous,endDate:day,startTime:"23:00",endTime:"04:00"}))form.set(key,value);
    const event=parseEvent(form,c.zone);
    assert.equal((event.endsAt.getTime()-event.startsAt.getTime())/3600000,expected);
    const instances=recurrenceInstances({startDate:previous,until:previous,frequency:"DAILY",weekdays:[],startTime:"23:00",endTime:"04:00",endDayOffset:1,timezone:c.zone});
    assert.equal(instances[0].endsAt.getTime(),event.endsAt.getTime());
    const item:Schedulable={key:"task",title:"Task",durationMinutes:30,priority:1,preferredWindow:"ANY",source:"AUTO"};
    const result=scheduleInWindows([calendarDayBounds(day,c.zone)],[event],[item],10);
    assert.ok(result.placements[0].startsAt.getTime()>=event.endsAt.getTime()+600000);
  });
}
test("midnight DST in Santiago starts at the first real instant of the date",()=>{
  const b=calendarDayBounds("2026-09-06","America/Santiago");assert.equal((b.end.getTime()-b.start.getTime())/3600000,23);
  assert.throws(()=>combineLocalDateTime("2026-09-06","00:30","America/Santiago"),/no existe/);
});
