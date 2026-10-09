import { startOfLocalWeek, addLocalDays, weekdayForDate } from "./time";
export function adjustedDuration(estimate: number, samples: number[]) {
  const valid = samples.filter(n => Number.isFinite(n) && n >= 1 && n <= 480).slice(-10).sort((a, b) => a - b);
  if (valid.length < 3) return estimate;
  const middle = Math.floor(valid.length / 2); const median = valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
  const lower = Math.max(5, Math.ceil(estimate * .75 / 5) * 5); const upper = Math.min(480, Math.floor(estimate * 1.25 / 5) * 5);
  return lower > upper ? estimate : Math.max(lower, Math.min(upper, Math.round(median / 5) * 5));
}
export function habitStats(days: number[], start: string, end: string, created: string, completed: Set<string>, today: string, weeklyTarget?: number, weekStartsOn = 1) {
  if (weeklyTarget) return weeklyHabitStats(start, end, created, completed, today, weeklyTarget, weekStartsOn);
  const expected: string[] = [];
  for (let day = start; day <= end; day = addLocalDays(day, 1)) if (day >= created && days.includes(weekdayForDate(day))) expected.push(day);
  let streak = 0;
  for (let day = today, count = 0; day >= created && count < 3660; day = addLocalDays(day, -1), count++) {
    if (!days.includes(weekdayForDate(day))) continue;
    if (day === today && !completed.has(day)) continue;
    if (!completed.has(day)) break;
    streak++;
  }
  return { streak, expected: expected.length, done: expected.filter(day => completed.has(day)).length };
}
export function learnedFocus(samples: { minute: number }[], fallback: string) {
  const counts = [0, 0, 0];
  for (const { minute } of samples) counts[minute >= 360 && minute < 720 ? 0 : minute >= 720 && minute < 1080 ? 1 : 2]++;
  return samples.length >= 12 ? ["MORNING", "AFTERNOON", "EVENING"][counts.indexOf(Math.max(...counts))] : fallback;
}

export function durationSuggestion(estimate: number, samples: number[]) {
  const valid = samples.filter(n => Number.isFinite(n) && n >= 1 && n <= 480).slice(-10);
  const suggested = adjustedDuration(estimate, valid);
  if (valid.length < 3 || suggested === estimate) return null;
  const sorted = [...valid].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { estimated: estimate, suggested, median, samples: valid.length };
}

export function durationEvidence(samples: number[]) {
  const valid = samples.filter(n => Number.isFinite(n) && n >= 1 && n <= 480).slice(-10).sort((a,b) => a-b);
  if (valid.length < 3) return undefined;
  const middle = Math.floor(valid.length / 2);
  return { samples: valid.length, median: valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2 };
}

export function weeklyHabitStats(start: string, end: string, created: string, completed: Set<string>, today: string, target: number, weekStartsOn = 1) {
  const monday = (day:string) => startOfLocalWeek(day, weekStartsOn);
  const count = (week:string) => [...completed].filter(day => day >= week && day <= addLocalDays(week,6) && day >= created).length;
  const quota = (week:string) => Math.min(target, Math.max(0, Math.round((new Date(addLocalDays(week,6)).getTime()-new Date(created > week ? created : week).getTime())/86400000)+1));
  let expected=0,done=0;
  for(let week=monday(start);week<=end;week=addLocalDays(week,7)){const q=quota(week);expected+=q;done+=Math.min(q,[...completed].filter(day=>day>=week&&day<=addLocalDays(week,6)&&day>=start&&day<=end&&day>=created).length);}
  let streak=0;
  for(let week=monday(today),i=0;i<520&&addLocalDays(week,6)>=created;week=addLocalDays(week,-7),i++){if(week===monday(today)&&count(week)<quota(week))continue;if(count(week)<quota(week))break;streak++;}
  return {streak,expected,done};
}
