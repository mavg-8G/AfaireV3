import { z } from "zod";
import { TaskFormSchema, DateSchema } from "./definitions";
export const TaskSeriesSchema = TaskFormSchema.omit({ dueDate: true }).extend({ frequency: z.enum(["WEEKLY", "MONTHLY"]), anchorDate: DateSchema, windowDays: z.coerce.number().int().min(1).max(31) }).refine(v => v.frequency !== "WEEKLY" || v.windowDays <= 7, "La ventana semanal admite hasta 7 días.");
