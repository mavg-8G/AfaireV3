# Historial de cambios

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
