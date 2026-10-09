import { z } from "zod";

export const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value && value >= "2000-01-01" && value <= "2100-12-31";
}, "Fecha inválida.");
export const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida.");
export const TimezoneSchema = z.string().refine(value => {
  try { new Intl.DateTimeFormat("es", { timeZone: value }); return true; } catch { return false; }
}, "Zona horaria inválida.");
const title = z.string().trim().min(1, "Escribe un título.").max(160);
const email = z.string().trim().toLowerCase().max(254).pipe(z.email("Introduce un email válido."));
const password = z.string().min(10, "Mínimo 10 caracteres.").max(72).refine(value => new TextEncoder().encode(value).length <= 72, "Máximo 72 bytes.");
export const SignupFormSchema = z.object({ name: z.string().trim().min(2).max(80), email, password, timezone: TimezoneSchema.default("America/Guayaquil") });
export const LoginFormSchema = z.object({ email, password: z.string().min(1).max(72).refine(value => new TextEncoder().encode(value).length <= 72, "Máximo 72 bytes.") });
export const EventFormSchema = z.object({ title, date: DateSchema, endDate: DateSchema.optional(), startTime: TimeSchema, endTime: TimeSchema, notes: z.string().max(2000).optional(), location: z.string().trim().max(200).optional(), travelMinutes: z.coerce.number().int().min(0).max(180).default(0) });
const schedulable = {
  categoryId: z.string().max(100).optional().transform(value => value || null),
  title,
  durationMinutes: z.coerce.number().int().min(5).max(480),
  priority: z.coerce.number().int().min(1).max(3),
  preferredWindow: z.enum(["MORNING", "AFTERNOON", "EVENING", "ANY"]),
};
export const HabitFormSchema = z.object({ ...schedulable, daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).transform(days => [...new Set(days)]), required: z.boolean().default(false), frequencyMode: z.enum(["DAYS", "WEEKLY"]).default("DAYS"), weeklyTarget: z.coerce.number().int().min(1).max(7).default(3) }).refine(value => value.frequencyMode === "WEEKLY" || value.daysOfWeek.length > 0, "Elige días o una frecuencia semanal.");
export const TaskBaseSchema = z.object({ ...schedulable, learningMatch: z.enum(["TITLE", "TEMPLATE", "CATEGORY"]).default("TITLE"), learningKey: z.string().trim().max(80).optional().transform(value => value || null), dueDate: z.union([DateSchema, z.literal("")]).optional(), energy: z.enum(["DEEP", "LIGHT"]).default("LIGHT"), splittable: z.preprocess(v => v === "on" ? true : v === "off" ? false : v, z.boolean().default(false)), minChunk: z.coerce.number().int().min(5).max(480).default(30) });
export const TaskFormSchema = TaskBaseSchema.refine(value => value.learningMatch !== "TEMPLATE" || Boolean(value.learningKey), "Escribe una plantilla de aprendizaje.").refine(value => value.learningMatch !== "CATEGORY" || Boolean(value.categoryId), "Elige una categoría para el aprendizaje.");
export const AvailabilitySchema = z.object({ weekday: z.number().int().min(0).max(6), active: z.boolean(), start: TimeSchema, end: TimeSchema }).refine(value => value.start < value.end, "La hora final debe ser posterior al inicio.");
export const SettingsFormSchema = z.object({
  name: z.string().trim().min(2).max(80), timezone: TimezoneSchema,
  dayStart: TimeSchema, dayEnd: TimeSchema, bufferMinutes: z.coerce.number().int().min(0).max(60),
  slackPercent: z.coerce.number().int().min(0).max(50).default(0), longBlockMinutes: z.coerce.number().int().min(30).max(240).default(90), recoveryMinutes: z.coerce.number().int().min(0).max(60).default(0),
  autoPlan: z.boolean(), carryOver: z.boolean(),
  urgencyEnabled: z.boolean().default(true), urgencySoonDays: z.coerce.number().int().min(0).max(365).default(3), urgencyNearDays: z.coerce.number().int().min(0).max(365).default(1),
  adaptiveAvailability: z.boolean(), adaptiveDurations: z.boolean().default(false), focusWindow: z.enum(["MORNING", "AFTERNOON", "EVENING", "LEARNED"]).default("MORNING"),
  availability: z.array(AvailabilitySchema).length(7).refine(rows => new Set(rows.map(row => row.weekday)).size === 7),
}).refine(value => value.dayStart < value.dayEnd, "El fin debe ser posterior al inicio.").refine(value => value.urgencyNearDays <= value.urgencySoonDays, "El umbral de dos niveles debe ser menor o igual al de un nivel.");
export const PasswordFormSchema = z.object({ currentPassword: z.string().min(1).max(72), newPassword: password });
export type AuthFormState = { errors?: Record<string, string[] | undefined>; message?: string; ok?: boolean };
export type ActionResult = { ok?: boolean; error?: string };
export const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
export const PRIORITY_LABELS: Record<number, string> = { 1: "Alta", 2: "Media", 3: "Baja" };
export const WINDOW_LABELS: Record<string, string> = { MORNING: "Mañana · 06–12", AFTERNOON: "Tarde · 12–18", EVENING: "Noche · 18–24", ANY: "Cualquier momento" };
export const COMMON_TIMEZONES = ["America/Guayaquil", "America/Bogota", "America/Lima", "America/Mexico_City", "America/Santiago", "America/Argentina/Buenos_Aires", "America/Sao_Paulo", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/Madrid", "Europe/London", "UTC"];
