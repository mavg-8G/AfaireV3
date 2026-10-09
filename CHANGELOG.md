# Historial de cambios

## Sin publicar · Interfaz renovada

- Nueva identidad visual: paleta verde pino con azul índigo para citas fijas, tipografías Bricolage Grotesque y Figtree autoalojadas (`@fontsource-variable`, compatibles con la CSP) e iconos propios en SVG.
- Modo oscuro revisado con superficies verde grisáceo, color de barra del sistema según el tema elegido (`theme-color` por cookie o por `prefers-color-scheme`) y selector Claro/Nocturno/Sistema con iconos.
- Navegación adaptable: barra lateral en escritorio y barra de pestañas inferior en móvil y tableta, con márgenes para notch, isla dinámica y barra de gestos (`viewport-fit=cover`, `safe-area-inset`).
- La agenda del día se muestra como línea de tiempo con horas a la izquierda, indicador del bloque en curso y progreso del bloque actual.
- PWA: botón «Instalar app» en Chrome, Edge y Android, instrucciones para iPhone y iPad, aviso de nueva versión, búsqueda de actualizaciones al volver a la app, accesos directos a Semana y Hábitos, icono de Apple sin esquinas transparentes y página sin conexión con la nueva paleta (caché pública v7).
- Móvil: campos a 16 px para evitar el zoom de iOS, objetivos táctiles de al menos 44 px, días de repetición como botones conmutables y semana compacta.

## 3.0.0 · 2026-10-09

- Versión 3.0.0 en el paquete, lockfile, documentación y pie de página en español e inglés.
- Prisma 7.10.0 con cliente generado en `src/generated/prisma`, adaptador PostgreSQL y configuración del CLI en `prisma.config.ts`; las migraciones SQL existentes se conservan.
- TypeScript 7.0.2 para comprobar tipos, con la API compatible de TypeScript 6.0.2 para ESLint y Next.js. ESLint 10.12.0 con la capa oficial de compatibilidad de plugins.
- Actualizaciones de date-fns 4.4.0, dotenv 18.0.7, esbuild 0.28.2, fast-check 4.10.2, tsx 4.23.15 y tipos de Node 26.6.5. Se conservan las versiones de los demás paquetes que ya estaban actualizadas.
- Docker sobre Node 26 Alpine; empaquetado del cliente PostgreSQL para el worker, comandos administrativos y healthchecks. Comprobación del compilador WASM y de los comandos con solo las dependencias de producción.
- Corrección de los actualizadores para validar una única imagen por servicio cuando Compose incluye también las dependencias.
- `mysql2` transitivo del CLI de Prisma fijado a 3.24.5 para corregir los avisos detectados en la auditoría. Auditoría de producción sin vulnerabilidades conocidas; persiste el aviso de desarrollo en `braces`, sin parche publicado.
- Validación local: 110 pruebas unitarias, 83 de integración, 44 comprobaciones HTTP y 14 casos de actualización; tipos, ESLint, build y paquetes de producción correctos. Construcción Docker pendiente de GitHub Actions.

## 2026-10-09 · Transparencia y aprendizaje

- Vista previa antes/después al capturar tareas, con confirmación atómica y protección frente a agenda cambiada, caducidad y reenvíos.
- Historial de 30 cambios y deshacer el último plan seguro, conservando citas, completados, identidades y nuevas tareas en la bandeja.
- Revisión de tareas tras tres aplazamientos: dividir, reducir duración, delegar, eliminar o conservar.
- Chequeo diario con resolución conjunta de pendientes, minutos reales y señal opcional para aprendizaje.
- Feedback explícito de carga, horario y duración, con ajustes acotados y explicaciones visibles durante 28 días.
- Objetivos semanales por categoría, reservas flexibles y progreso real/pendiente; respetan capacidad, urgencias, calendario y descansos.
- Migraciones aditivas: `20261009100000_planner_transparency`, `20261009102000_budget_blocks` y `20261009103000_feedback_sources`. Ya aplicadas en local; la versión sigue en 2.0.0.
- Validación: 73 pruebas unitarias, 64 de integración y 36 comprobaciones HTTP; ESLint, TypeScript, producción y worker. Flujos comprobados en Chrome con cuentas temporales, incluyendo móvil e inglés.
- El push inicia la verificación y publicación de imágenes en GitHub. El VPS se actualiza por separado y aplica las migraciones con el contenedor de migraciones.


## 2026-10-09 · Header y activación de avisos

- Header compacto con navegación y menú de cuenta; tema, sesiones y cierre de sesión agrupados. Navegación desplazable en móvil y cierre del menú con Escape, al salir del foco o al tocar fuera.
- Configuración VAPID persistente mediante `push:setup`, sin imprimir claves ni reemplazar parejas existentes; instrucciones para recrear web y worker en Docker.
- Estado de notificaciones más claro, actualización del contador tras activar/desactivar un dispositivo y errores accesibles.
- Validación del header y la activación de avisos: 69 pruebas unitarias, 32 comprobaciones HTTP, ESLint, compilación y revisión del header en tres tamaños con claro/nocturno. La recepción real requiere activar un dispositivo.

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
