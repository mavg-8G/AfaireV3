export const HABIT_TEMPLATES = [
  { key: "breakfast", title: "Desayunar con calma", durationMinutes: 25, preferredWindow: "MORNING" as const, priority: 1, required: true },
  { key: "exercise", title: "Mover el cuerpo", durationMinutes: 30, preferredWindow: "MORNING" as const, priority: 2, required: false },
  { key: "lunch", title: "Pausa para almorzar", durationMinutes: 45, preferredWindow: "AFTERNOON" as const, priority: 1, required: true },
  { key: "reading", title: "Leer un poco", durationMinutes: 20, preferredWindow: "EVENING" as const, priority: 3, required: false },
  { key: "review", title: "Cerrar y revisar el día", durationMinutes: 15, preferredWindow: "EVENING" as const, priority: 2, required: false },
];

export const TASK_BUNDLES = [
  { key: "trip", title: "Preparar viaje", tasks: [{ title: "Reservar transporte y alojamiento", minutes: 60, offset: -14, priority: 1, energy: "LIGHT" }, { title: "Revisar documentación y reservas", minutes: 30, offset: -7, priority: 1, energy: "LIGHT" }, { title: "Preparar equipaje", minutes: 45, offset: -1, priority: 2, energy: "LIGHT" }] },
  { key: "project", title: "Preparar una entrega", tasks: [{ title: "Definir el alcance de la entrega", minutes: 45, offset: -7, priority: 1, energy: "DEEP" }, { title: "Preparar la entrega", minutes: 120, offset: -3, priority: 1, energy: "DEEP" }, { title: "Revisar y enviar", minutes: 30, offset: 0, priority: 1, energy: "LIGHT" }] },
] as const;
export const WEEK_TEMPLATES = [
  { key: "balanced", title: "Semana de trabajo · 09–17", start: "09:00", end: "17:00" },
  { key: "mornings", title: "Solo mañanas · 08–12", start: "08:00", end: "12:00" },
] as const;
