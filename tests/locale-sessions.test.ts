import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceLabel } from "../src/lib/device-sessions";
import { parsePreferences, displayTime, displayDay, translator, orderedWeekdays, weekdayLabel } from "../src/lib/locale";
import { startOfLocalWeek } from "../src/lib/time";
import { habitStats } from "../src/lib/insights";
import { dueNotices } from "../src/lib/notifications";
test("locale preferences reject unsupported input and keep stable defaults", () => {
 assert.deepEqual(parsePreferences({ locale: "en", hourFormat: "12", weekStartsOn: "0" }), { locale: "en", hourFormat: "12", weekStartsOn: 0 });
 for(const bad of [{locale:"xx",hourFormat:"12",weekStartsOn:0},{locale:"es",hourFormat:"13",weekStartsOn:1},{locale:"en",hourFormat:"24",weekStartsOn:6}]) assert.equal(parsePreferences(bad).locale,"es");
});
test("localized clock and headings respect timezone, DST and exact calendar day", () => {
 const en={locale:"en",hourFormat:"12",weekStartsOn:0}, es={locale:"es",hourFormat:"24",weekStartsOn:1};
 assert.match(displayTime(new Date("2026-03-08T06:30Z"),"America/New_York",en),/01:30 AM/);
 assert.match(displayTime(new Date("2026-03-08T07:30Z"),"America/New_York",en),/03:30 AM/);
 assert.equal(displayTime(new Date("2026-03-08T07:30Z"),"America/New_York",es),"03:30");
 assert.match(displayDay("2030-04-21","Pacific/Kiritimati",en),/Sunday.*21/);
 assert.equal(startOfLocalWeek("2030-04-21",0),"2030-04-21");assert.equal(startOfLocalWeek("2030-04-21",1),"2030-04-15");
 assert.deepEqual(orderedWeekdays(1),[1,2,3,4,5,6,0]);assert.equal(weekdayLabel(0,"en"),"Sun");
});
test("translations preserve user interpolation and translate composite explanations", () => {
 const t=translator("en");assert.equal(t("Hola, Matías"),"Hello, Matías");
 assert.equal(t("12 bloques en tu agenda. 3 completados."),"12 blocks in your planner. 3 completed.");
 assert.equal(t("Encaja en tu franja preferida. Prioridad 1 y vencimiento 2030-04-21."),"Fits within your preferred hours. Priority 1, due 2030-04-21.");
 assert.equal(t("Revisa «Cena de cumpleaños»: prueba menos días o una duración menor para sostener la rutina."),'Review “Cena de cumpleaños”: try fewer days or a shorter duration to keep the habit sustainable.');
 assert.equal(t("Mi título sin traducción"),"Mi título sin traducción");assert.equal(t("constructor"),"constructor");
});
test("weekly statistics use Sunday or Monday consistently", () => {
 const done=new Set(["2030-04-20"]);
 assert.equal(habitStats([],"2030-04-21","2030-04-21","2030-04-01",done,"2030-04-21",1,0).done,0);
 assert.equal(habitStats([],"2030-04-15","2030-04-21","2030-04-01",done,"2030-04-21",1,1).done,1);
});
test("device labels are bounded summaries and never store raw injected user agents", () => {
 assert.equal(deviceLabel("Mozilla Windows Chrome/120 Edg/120"),"Edge · Windows");
 assert.equal(deviceLabel("iPhone Safari/600"),"Safari · iPhone");
 assert.equal(deviceLabel('<script>alert(1)</script>'+"x".repeat(3000)),"Navegador · Dispositivo desconocido");
});
test("English push translates generated text without changing user titles or delivery keys",()=>{
 const now=new Date("2030-04-21T08:00Z"),settings={upcoming:true,leadMinutes:10,dailySummary:true,summaryTime:"08:00",dueTomorrow:true,dueTime:"18:00"};
 const events=[{id:"one",title:"Contraseña",startsAt:new Date("2030-04-21T08:05Z"),status:"PENDING",travelMinutes:1}];
 const english=dueNotices(now,"UTC",settings,events,[],"en"),spanish=dueNotices(now,"UTC",settings,events,[]);
 assert.equal(english[0].title,"Your next block starts in 5 min");assert.equal(english[0].body,"Contraseña · allow 1 min for travel");assert.equal(english[0].key,spanish[0].key);
 assert.equal(english[1].body,"1 blocks in your planner. 0 completed.");
});
