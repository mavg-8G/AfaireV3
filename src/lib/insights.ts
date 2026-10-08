import { addLocalDays, weekdayForDate } from "./time";
export function adjustedDuration(estimate: number, samples: number[]) {
  const valid = samples.filter(n => Number.isFinite(n) && n >= 1 && n <= 480).slice(-10).sort((a, b) => a - b);
  if (valid.length < 3) return estimate;
  const middle = Math.floor(valid.length / 2); const median = valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
  const lower = Math.max(5, Math.ceil(estimate * .75 / 5) * 5); const upper = Math.min(480, Math.floor(estimate * 1.25 / 5) * 5);
  return lower > upper ? estimate : Math.max(lower, Math.min(upper, Math.round(median / 5) * 5));
}
export function habitStats(days: number[], start: string, end: string, created: string, completed: Set<string>, today: string) {
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
