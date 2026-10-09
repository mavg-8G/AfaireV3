import { z } from "zod";
import { TaskBaseSchema, DateSchema } from "./definitions";
export const TaskSeriesSchema = TaskBaseSchema.omit({ dueDate: true, learningMatch: true, learningKey: true }).extend({ frequency: z.enum(["WEEKLY", "MONTHLY"]), anchorDate: DateSchema, windowDays: z.coerce.number().int().min(1).max(31) }).refine(v => v.frequency !== "WEEKLY" || v.windowDays <= 7, "La ventana semanal admite hasta 7 días.");
