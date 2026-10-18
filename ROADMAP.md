# Hoja de ruta de Afaire

Actualizada el 18 de octubre de 2026. Este documento recoge prioridades de producto, sin fechas de entrega comprometidas. El [README](README.md) describe las funciones disponibles y [PLAN.md](PLAN.md) conserva el plan inicial.

## Estado actual

El código incluye planificación automática, citas y tareas recurrentes simples, división opcional de tareas, hábitos, disponibilidad adaptable, vista horaria de día y semana, movimiento de bloques pendientes, revisión semanal, ajustes organizados por pestañas con contraseña y sesiones en el menú de cuenta, avisos Web Push y una copia editable de hoy sin conexión. La versión del paquete es 3.0.0; publicar código en GitHub y actualizar el VPS son pasos separados.

## Próximas prioridades

| Orden | Trabajo | Criterio para considerarlo listo |
| --- | --- | --- |
| 1 | Exportar e importar calendarios `.ics` | Exportación con zona horaria y repeticiones correctas; importación con vista previa, detección de duplicados y conflictos, sin alterar citas existentes por sorpresa. |
| 2 | Recuperación de cuenta y portabilidad | Restablecimiento de contraseña con enlaces de un solo uso y caducidad; exportación de los datos propios de la cuenta en un formato documentado. |
| 3 | Recurrencias más flexibles | Intervalos como cada dos semanas y series sin fecha final, materializadas en un horizonte limitado; las excepciones y los cambios futuros conservan el historial. |
| 4 | Sin conexión para varios días | Consulta y captura de trabajo para más de una fecha, con cola persistente, control de versiones y resolución visible de conflictos al reconectar. |

## Programa de hábitos

Objetivo: que el usuario cumpla sus hábitos, los haga a tiempo, encuentre un horario que funcione y añada actividades sin sobrecargarse. Se apoya en métodos de psicología del comportamiento; las referencias están pendientes de verificación antes de citarlas fuera de este documento.

### Estado de implementación

Incorporado: versión mínima y plan si-entonces opcionales, cierre diferenciado de sesiones mínimas, objetivo semanal e historial visual de ocho semanas, e invitación a retomar desde Hoy. Las sesiones mínimas se excluyen del aprendizaje de duración completa.

La entrega A está parcialmente implementada. Faltan finalización real y momento de registro separados, conservación del horario original, corrección retrospectiva y métricas que distingan ejecución completa y mínima en todas las vistas. El historial actual usa la frecuencia vigente del hábito. Las entregas B, C y D siguen pendientes.

### Principios propuestos, pendientes de validación

- **Contexto estable antes que ajuste continuo.** La automaticidad crece al repetir la conducta en el mismo contexto (Lally et al., 2010; Wood y Neal). El horario se explora con retos temporales y después se fija; no se propone otro cambio durante 4–6 semanas salvo que el cumplimiento caiga.
- **Señal elegida por el usuario.** Permitir una rutina («después de…») o una hora. El ensayo de Keller et al. (2021) encontró mejoras con ambas, sin diferencias entre grupos.
- **Faltar una vez no borra el progreso.** No hay rachas que vuelvan a cero; volver después de una interrupción se reconoce (Milkman et al., 2021).
- **Cumplir no equivale a hábito formado.** La medición de automaticidad está pendiente. Si se incorpora SRBAI, respetar su instrumento y validar cualquier adaptación; una o dos preguntas propias no equivalen a una escala validada.
- **Recompensas informativas, no controladoras.** Sin puntos, clasificaciones ni comparación social; los logros explican qué reconocen (teoría de la autodeterminación).

### Métodos adicionales por evaluar

Son propuestas de producto, no funciones disponibles ni resultados garantizados. Los comodines no deben borrar oportunidades incumplidas de la medición.

| Método | Uso en Afaire |
| --- | --- |
| Plan si-entonces / WOOP (Oettingen) | Cuando un motivo de dificultad se repite, se propone un plan: «si estoy cansado, haré la versión mínima». |
| Metas en rango y comodines (Scott y Nowlis, 2013; Sharif y Shu) | Objetivos como «3–5 sesiones» y uno o dos comodines al mes que no cuentan como incumplimiento. |
| Empezar en pequeño (Fogg) | Todo hábito nuevo empieza con su versión mínima; ampliar llega después. |
| Efecto de nuevo comienzo (Dai, Milkman y Riis, 2014) | Las propuestas de hábitos y retos aparecen en fechas de inicio: lunes, primero de mes, regreso de vacaciones. |
| Retirada gradual de recordatorios (Stawarz et al., 2015) | Los avisos disminuyen cuando la automaticidad declarada es alta, para que la señal sea el ancla y no la notificación. |
| Agrupar con algo agradable (Milkman et al., 2014) | Campo opcional «acompañar con…». |

### Entregas

| Entrega | Incluye | Condición para avanzar |
| --- | --- | --- |
| A. Base fiable | Inicio y fin reales con acciones «Empezar», «Terminar» y «Lo hice antes»; momento del registro; hora planificada original que no se sobrescribe al reprogramar; resultado completo, mínimo, omitido o pendiente; motivo opcional de dificultad; definición de versión mínima y ancla por hábito; pregunta de automaticidad. La información ausente se muestra como desconocida y los bloques futuros no cuentan como incumplidos. | Los datos representan la ejecución real durante 2–3 semanas de uso. |
| B. Horarios | Sugerencias por hábito con las observaciones que las sustentan, a partir de seis oportunidades evaluables (contadas en oportunidades, no en semanas); retos temporales con fases de explorar y estabilizar; sugerencia de ancla además de hora; plan si-entonces ante motivos repetidos. Las actividades con hora fija conservan esa restricción y una mejora coincidente se presenta como señal favorable, no como prueba causal. | Menos reprogramaciones y más inicios dentro de la ventana, con propuestas que el usuario entiende. |
| C. Acompañamiento | Una misión activa por hábito (constancia, horario o recuperación) con metas en rango y comodines; progreso con denominadores visibles; logros sin duplicados que se recalculan tras correcciones y cuyas celebraciones pueden silenciarse; recordatorios que se reducen según la automaticidad. | Más regresos tras una interrupción sin aumento de la carga percibida. |
| D. Crecimiento | Mantener, ampliar o añadir en la revisión semanal, solo con buen cumplimiento, automaticidad alta y espacio disponible; ofrecido en fechas de nuevo comienzo; lo nuevo empieza en su versión mínima y anclado a un hábito estable. Añadir exige elección explícita, muestra el tiempo adicional y dónde cabe; descartar evita que reaparezca continuamente. | Más actividades sostenidas sin perjudicar las existentes. |

La evaluación inicial durará 8–12 semanas tras disponer de medición fiable. Se medirán cumplimiento completo y mínimo por separado, puntualidad con cobertura de datos visible, oportunidades hasta retomar, actividades mantenidas y sobrecarga. Con suficientes usuarios se compararán grupos asignados al azar; las comparaciones con el propio periodo anterior serán exploratorias y no demostrarán causalidad.

## Después

- Sincronización de calendarios externos: empezar por lectura de disponibilidad y citas, con autorización por cuenta y reglas explícitas para cambios y borrados. Evaluar escritura bidireccional solo tras resolver los conflictos de sincronización.
- Proyectos y dependencias entre tareas: organizar entregas de varios pasos e impedir que el planificador coloque un paso antes de sus requisitos.
- Preferencias de horas más precisas y turnos iniciales que crucen medianoche.

Cada ampliación debe mantener el aislamiento entre cuentas, las reglas de zona horaria y horario de verano, las citas protegidas y la capacidad de restaurar los datos. Antes de publicarse debe pasar tipos, lint, pruebas del motor e integración, build de producción y comprobaciones HTTP; los cambios de interfaz requieren también revisión en escritorio y móvil.
