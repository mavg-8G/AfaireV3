# Historial de cambios

## 2026-10-09 · Planificador, sesiones y configuración regional

- Gestión de sesiones por dispositivo, cierre individual o de las demás sesiones, invalidación de cookies copiadas y desvinculación de push al salir.
- Preferencias de español/inglés, reloj de 12/24 horas y semanas desde lunes/domingo; cuotas, estadísticas, revisión y plantillas respetan el calendario elegido.
- Navegación y formularios traducidos, avisos push según el idioma y copia offline con idioma, hora y tema guardados.
- Acceso por teclado con salto al contenido, controles más amplios, estados accesibles y mejor contraste en bloques completados y tema oscuro.

- Planificación con holgura porcentual y recuperación tras bloques largos, con presupuesto que incluye el tiempo ocupado por descansos.
- Modo poco tiempo (50 %) y día difícil (30 %, esenciales y urgentes) por fecha, preservando citas, bloques fijados y completados.
- Vacaciones, festivos y horarios temporales; el worker utiliza las mismas excepciones que la agenda.
- Previsión de carga a 7 días y plazos en riesgo hasta 28 días, antes de generar el plan.
- Tareas flexibles semanales y mensuales con ventana de cumplimiento, materialización idempotente y renovación incluso con autoagendado desactivado.
- Hábitos por objetivo semanal, selección de días con más capacidad y estadísticas por semanas.
- Plantillas de preparar viaje/entrega y semanas de trabajo o mañanas, sin modificar el horario base.

- Horas de silencio en la zona de la cuenta, selección de tipos de aviso y retirada de endpoints 404/410 con historial visible.
- Validación del estado y del horario del bloque bajo bloqueo de agenda antes de cada envío; deduplicación estable aunque cambie la antelación y compatibilidad con claves anteriores.
- Observabilidad independiente de planificación y avisos, con registros por cuenta y procesamiento aislado de fallos.
- Sugerencias de duración por tarea, calculadas con mediciones reales y aplicables desde la bandeja.
- Explicación persistida de la colocación automática y del horario fijado manualmente.
- Casos de DST, zona horaria, edición individual y de siguientes, carreras, reintentos y caducidad push. Guía manual en TESTING.md.

### Validación y actualización

63 pruebas unitarias, 52 de integración y 31 comprobaciones HTTP aprobadas, además de ESLint, compilación de producción y empaquetado del worker. Push verificado con transporte simulado; la recepción real se comprueba en los dispositivos del despliegue.

Las migraciones `20261009010000_notification_quality`, `20261009020000_planner_capacity`, `20261009021000_capacity_constraints` y `20261009030000_sessions_locale` se aplican con el contenedor de migraciones durante la actualización. La versión del paquete se mantiene en 2.0.0. Las cookies anteriores sin registro de dispositivo requieren iniciar sesión de nuevo. Las suscripciones push existentes se conservan y se pueden retirar desde Ajustes.

El push a GitHub inicia el workflow de verificación y publicación de imágenes por SHA. El VPS se actualiza por separado, una vez que las imágenes estén disponibles.

## 2.0.0 · 2026-10-08

- Modo nocturno para agenda, ajustes, formularios e inicio de sesión. Selector Claro/Nocturno/Sistema con preferencia persistida por navegador y aplicada desde la respuesta inicial, sin destello claro.
- Colores adaptados para fondos, texto, campos, botones y avisos. La vista offline sigue la apariencia del sistema; caché pública renovada para descargar sus estilos.
- Versión del paquete y lockfile actualizada a 2.0.0, visible como Afaire v2 en la aplicación.

## 2026-10-08 · Agenda recurrente, avisos y revisión semanal

- Citas con repetición diaria, semanal por días o mensual, con fecha final hasta 366 días desde el inicio. Edición de una ocurrencia o de esa y las siguientes, conservando el historial y rechazando conflictos de forma atómica.
- Web Push para próximos bloques, resumen del día y tareas que vencen mañana. Preferencias por cuenta, hasta cinco dispositivos, reclamación atómica de entregas, reintentos y retirada de suscripciones caducadas.
- Copia privada del día actual sin conexión, solo lectura, con fecha de actualización, caducidad al terminar el día local y borrado al salir o detectar una sesión inválida.
- Resultados y fallos de generación diaria persistidos; estado del worker, reintentos y errores de avisos visibles en Ajustes.
- Rachas y cumplimiento de hábitos, revisión semanal, registro de minutos reales y comparación por tarea con la estimación utilizada.
- Ajuste opcional de duraciones desde tres mediciones; tareas profundas o ligeras y selección de la franja de foco.
- Ubicación y minutos manuales de traslado reservados antes de las citas, respetando los descansos del planificador.
- Pruebas adicionales de medianoche, zonas horarias, DST, recurrencias, rollback, aislamiento, traslados, duración, privacidad offline y concurrencia push.
- Integración con Caddy existente, uso de imágenes publicadas en GHCR y salida HTTPS del worker para Web Push. Instalación de la PWA desde el navegador y ajustes de interfaz pendientes incluidos.

### Actualización

Espera a que el workflow de GitHub Actions publique las imágenes del nuevo commit. En el VPS ejecuta `sh /opt/docker/afaire/scripts/update.sh`; hace respaldo, selecciona las imágenes del mismo SHA y aplica la migración aditiva `20261008220000_agenda_features`. Los datos y secretos del `.env` se conservan.

Para activar avisos, genera una vez las claves con `npm run push:keys` y configura `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`. Activa cada dispositivo en Ajustes; en iOS requiere abrir la PWA instalada. La entrega real debe comprobarse tras el despliegue. La copia offline contiene información de agenda en el dispositivo; su comportamiento se describe en `SECURITY.md`.

### Validación local

45 pruebas unitarias, 21 de integración y 20 comprobaciones HTTP aprobadas. TypeScript, ESLint, build de producción y empaquetado del worker aprobados. Migración validada en PostgreSQL local. Push probado con transporte simulado; Docker y la recepción real en dispositivos quedan sujetos a comprobación en el entorno de despliegue.
