export const HABIT_TEMPLATES = [
  { key: "breakfast", title: "Desayunar con calma", durationMinutes: 25, preferredWindow: "MORNING" as const, priority: 1, required: true },
  { key: "exercise", title: "Mover el cuerpo", durationMinutes: 30, preferredWindow: "MORNING" as const, priority: 2, required: false },
  { key: "lunch", title: "Pausa para almorzar", durationMinutes: 45, preferredWindow: "AFTERNOON" as const, priority: 1, required: true },
  { key: "reading", title: "Leer un poco", durationMinutes: 20, preferredWindow: "EVENING" as const, priority: 3, required: false },
  { key: "review", title: "Cerrar y revisar el día", durationMinutes: 15, preferredWindow: "EVENING" as const, priority: 2, required: false },
];
