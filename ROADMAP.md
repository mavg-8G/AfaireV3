# Hoja de ruta de Afaire

Actualizada el 11 de octubre de 2026. Este documento recoge prioridades de producto, sin fechas de entrega comprometidas. El [README](README.md) describe las funciones disponibles y [PLAN.md](PLAN.md) conserva el plan inicial.

## Estado actual

El código incluye planificación automática, citas y tareas recurrentes simples, división opcional de tareas, hábitos, disponibilidad adaptable, vista horaria de día y semana, movimiento de bloques pendientes, revisión semanal, ajustes organizados por pestañas con contraseña y sesiones en el menú de cuenta, avisos Web Push y una copia editable de hoy sin conexión. La versión del paquete es 3.0.0; publicar código en GitHub y actualizar el VPS son pasos separados.

## Próximas prioridades

| Orden | Trabajo | Criterio para considerarlo listo |
| --- | --- | --- |
| 1 | Exportar e importar calendarios `.ics` | Exportación con zona horaria y repeticiones correctas; importación con vista previa, detección de duplicados y conflictos, sin alterar citas existentes por sorpresa. |
| 2 | Recuperación de cuenta y portabilidad | Restablecimiento de contraseña con enlaces de un solo uso y caducidad; exportación de los datos propios de la cuenta en un formato documentado. |
| 3 | Recurrencias más flexibles | Intervalos como cada dos semanas y series sin fecha final, materializadas en un horizonte limitado; las excepciones y los cambios futuros conservan el historial. |
| 4 | Sin conexión para varios días | Consulta y captura de trabajo para más de una fecha, con cola persistente, control de versiones y resolución visible de conflictos al reconectar. |

## Después

- Sincronización de calendarios externos: empezar por lectura de disponibilidad y citas, con autorización por cuenta y reglas explícitas para cambios y borrados. Evaluar escritura bidireccional solo tras resolver los conflictos de sincronización.
- Proyectos y dependencias entre tareas: organizar entregas de varios pasos e impedir que el planificador coloque un paso antes de sus requisitos.
- Preferencias de horas más precisas y turnos iniciales que crucen medianoche.

Cada ampliación debe mantener el aislamiento entre cuentas, las reglas de zona horaria y horario de verano, las citas protegidas y la capacidad de restaurar los datos. Antes de publicarse debe pasar tipos, lint, pruebas del motor e integración, build de producción y comprobaciones HTTP; los cambios de interfaz requieren también revisión en escritorio y móvil.
