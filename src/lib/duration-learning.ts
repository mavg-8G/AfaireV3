export const normalizedTitle = (title: string) => title.trim().toLocaleLowerCase();
type LearningTask = { title: string; categoryId: string | null; learningMatch: string; learningKey: string | null };
export type DurationMeasurement = { title: string; actualMinutes: number | null; estimatedMinutes: number | null; startsAt: Date; endsAt: Date; taskId?: string | null; habitId?: string | null; chunkIndex: number | null; task?: LearningTask | null };

// Compare with the estimate of the measured block, never today's task estimate.
export function validDurationMeasurements(history: DurationMeasurement[]) {
  return history.filter(row => {
    const estimate = row.estimatedMinutes ?? (row.endsAt.getTime() - row.startsAt.getTime()) / 60_000;
    return row.chunkIndex === null && row.actualMinutes != null && Number.isFinite(row.actualMinutes) && row.actualMinutes >= 1 && row.actualMinutes <= 480 && estimate > 0 && row.actualMinutes >= estimate * .1;
  });
}
export function taskMeasurements(task: LearningTask, history: DurationMeasurement[]) {
  return validDurationMeasurements(history).filter(row => {
    if (!row.taskId || !row.task) return false;
    if (task.learningMatch === "TEMPLATE") return Boolean(task.learningKey) && row.task.learningMatch === "TEMPLATE" && normalizedTitle(row.task.learningKey ?? "") === normalizedTitle(task.learningKey!);
    if (task.learningMatch === "CATEGORY") return Boolean(task.categoryId) && row.task.categoryId === task.categoryId;
    return row.task.learningMatch === "TITLE" && normalizedTitle(row.title) === normalizedTitle(task.title);
  }).map(row => row.actualMinutes!);
}
