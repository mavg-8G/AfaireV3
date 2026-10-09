# Pruebas locales de agenda y avisos

Guía para verificar las funcionalidades del repositorio en un entorno local. La versión del paquete sigue siendo 3.0.0. Publicar el código en GitHub no actualiza el VPS: ese despliegue se realiza por separado.

## Arranque

La migración `20261009010000_notification_quality` añade las horas de silencio, la explicación de los bloques y el tipo de ejecución del worker. Ya está aplicada en la base local de esta sesión.

Para arrancar desde cero con tu `.env` local, abre terminales separadas:

```sh
npm run db:local
```

```sh
npm run db:migrate
npm run dev
```

```sh
npm run worker
```

Antes de arrancar web y worker, configura Web Push una sola vez con `npm run push:setup -- --subject https://afaire.espectro.uk` (o tu contacto HTTPS / `mailto:`). El comando escribe `.env`, conserva la pareja existente y no imprime secretos. Si ambos procesos estaban arrancados, reinícialos.

Abre http://127.0.0.1:3000. Los avisos reales requieren claves VAPID en `.env`, permiso del navegador y un worker activo. Las pruebas automatizadas usan un transporte simulado y no envían avisos a dispositivos reales.

## Casos para probar

1. En Ajustes → Notificaciones, activa o desactiva cada aviso y guarda. Activa silencio de 22:00 a 08:00; no deben emitirse avisos dentro de la franja. Inicio incluido y fin excluido; dos horas iguales silencian todo el día. Usa tu zona horaria, también al cambiar de zona. Al salir del silencio solo se envían avisos que siguen en su ventana, sin recuperar avisos vencidos.
2. Crea una cita semanal a las 09:00 en America/New_York que cruce un cambio de horario. Mantiene las 09:00 en la zona de la serie y cambia su instante UTC. Las horas inexistentes o ambiguas se rechazan con la fecha afectada; no se guarda una serie parcial.
3. Edita Solo esta y comprueba que sus vecinas mantienen el horario. Edita Esta y las siguientes y comprueba que el historial previo permanece. Las ocurrencias siguientes completadas o en curso impiden reemplazar esa parte de la serie. Cambiar la zona de la cuenta no mueve citas existentes; una nueva edición usa la zona actual.
4. Pon un bloque dentro de la antelación del aviso y comprueba que se envía una sola vez por dispositivo y hora de inicio. Cambiar la antelación no lo repite. Completa, omite, mueve, elimina o vuelve a planificar un bloque antes del envío: el aviso antiguo se descarta. Los reintentos vuelven a validar el estado actual.
5. Ajustes → Automatización muestra señales independientes para planificación y avisos, fallos, próximos intentos del plan y envíos agotados. Los 404/410 retiran el dispositivo y conservan un registro durante 30 días sin exponer su endpoint. Los fallos transitorios admiten cinco intentos, separados por más de dos minutos, mientras el aviso siga vigente.
6. Crea y completa tres tareas con el mismo título, usando Empezar/Hecho o guardando minutos reales. En una cuarta tarea pendiente con ese título, Bandeja muestra una sugerencia si la mediana difiere de la estimación. Aplicarla modifica su duración para futuros planes, conservando los bloques históricos. El ajuste por aplicación es como máximo del 25 % y usa las diez últimas mediciones válidas.
7. En Ajustes elige tu franja de foco o Aprender del uso; crea tareas profundas y ligeras. Las profundas sin preferencia explícita intentan encajar en la franja de foco. Las esenciales, la prioridad y el vencimiento siguen precediendo al desempate por energía. Una preferencia explícita de la tarea tiene precedencia. Si no cabe, busca otro hueco.
8. Organiza un día y abre ¿Por qué este bloque está aquí?: explica franja, alternativa, duración ajustada, descansos, prioridad y restricciones. Al fijar o mover un bloque manualmente cambia la explicación. Los bloques anteriores a esta migración muestran una indicación hasta regenerarse.
9. Comprueba Hábitos (racha y cumplimiento hasta hoy) y Revisión semanal (completados, pendientes, omitidos, medidos y sugerencias). La racha excluye días no previstos; el cumplimiento histórico usa el calendario actual del hábito.

## Verificación automatizada

```sh
npm test
npm run test:integration
npm run lint
npm run typecheck
npm run build
npm run worker:build
```

Con `npm start` ejecutándose en otro terminal, `npm run test:web` comprueba páginas con sesión y crea/elimina sus propias cuentas temporales. Todas las pruebas de integración se ejecutan en la base local y eliminan sus registros temporales.

La deduplicación coordina workers concurrentes y respeta claves de versiones anteriores. Web Push no ofrece confirmación de lectura ni entrega exactamente una vez: si el proveedor acepta un envío pero se pierde su respuesta o el worker cae antes de registrar el éxito, un reintento puede repetirlo. La etiqueta estable del aviso sustituye una notificación del mismo bloque. Un aviso ya aceptado por el proveedor no puede retirarse mediante una edición posterior; su TTL se limita al inicio del bloque, con un máximo de cinco minutos.

## Mejoras del planificador

Las migraciones `20261009020000_planner_capacity` y `20261009021000_capacity_constraints` ya están aplicadas en la base local de esta sesión. Mantén el worker local activo al probar la renovación de tareas recurrentes; no se ha actualizado el VPS.

- **Holgura:** Ajustes → Holgura para imprevistos. Prueba 20 % reservado, bloque largo desde 90 min y recuperación extra de 20 min. El porcentaje se calcula sobre el tiempo libre después de las citas y sus descansos; el presupuesto cuenta también los huecos consumidos por los descansos automáticos. Los valores iniciales son 0 % y 0 min extra para conservar tus preferencias actuales.
- **Capacidad reducida:** en Hoy puedes elegir Día normal, Hoy tengo poco tiempo (50 %) o Día difícil (30 %). Reorganiza solo los bloques flexibles pendientes que aún no empiezan. Día difícil considera hábitos esenciales, tareas de prioridad alta y tareas que vencen hoy, mañana o están atrasadas. No garantiza que todo lo urgente quepa; lo que falta queda explicado. Las citas, los bloques fijados, completados o empezados conservan su lugar. El modo se guarda para esa fecha y no modifica el perfil base.
- **Sobrecarga:** Hoy, Semana y Bandeja muestran carga para los próximos siete días y plazos en riesgo hasta 28 días. La previsión considera citas protegidas, ventanas de apertura, huecos continuos, excepciones y holgura; los hábitos aportan una carga aproximada. Las tareas flexibles programadas se cuentan como demanda, para evitar descontarlas dos veces como ocupación y trabajo pendiente.
- **Vacaciones/festivos:** Ajustes → Vacaciones y días especiales. Aplica una pausa a un rango o un horario temporal, y comprueba Semana. Se liberan los bloques automáticos futuros pendientes; no se mueven citas ni bloques protegidos. El worker no genera agenda en fechas pausadas y vuelve al horario base al acabar el rango. Puedes restaurar una excepción individual. Los avisos conservan sus preferencias propias; pausar la agenda no silencia automáticamente tus notificaciones.
- **Recurrencia flexible:** Bandeja → Tareas recurrentes flexibles. Elige una primera apertura en viernes para una repetición semanal, o un día del mes para una mensual. La ventana incluye su fecha inicial: siete días desde un viernes vencen el jueves siguiente. Los días 29–31 se ajustan al último día del mes cuando sea necesario. Se preparan ventanas vigentes y futuras hasta 90 días y el worker renueva ese horizonte, incluso sin autoagendado. Las instancias futuras se muestran en la bandeja al abrirse la ventana, salvo las que ya estén programadas. Una ventana vencida se señala para revisión y no se programa automáticamente fuera de plazo. Detener la serie conserva ventanas ya abiertas y tareas fijadas, iniciadas o completadas; retira futuras instancias pendientes.
- **Frecuencia de hábitos:** Hábitos → Frecuencia → Veces por semana. Prueba un objetivo de tres, un día con poco espacio y otro con más horas. El motor elige los días con más capacidad de los que quedan desde la fecha que estás planificando hasta el domingo, respeta omisiones y descuenta ocurrencias reservadas o completadas. Replanificar no agrega una cuarta. Al cambiar la frecuencia se liberan futuras reservas flexibles, conservando bloques protegidos. El cumplimiento usa el objetivo semanal y la racha cuenta semanas cumplidas; la semana actual incompleta todavía no rompe la racha.
- **Plantillas de tareas:** Bandeja → Plantillas de tareas. Preparar viaje crea transporte/alojamiento (14 días antes), documentación (7 días antes) y equipaje (1 día antes). Preparar entrega crea alcance (7 días antes), elaboración (3 días antes) y revisión/envío (fecha objetivo). Se pueden editar las tareas creadas; aplicar el mismo paquete a la misma fecha no lo duplica.
- **Semana tipo:** Ajustes → Plantilla de semana. Aplica Trabajo 09–17 o Mañanas 08–12 a un lunes futuro; configura lunes a viernes y pausa el fin de semana mediante excepciones. Las excepciones anteriores de esa semana se sustituyen y el horario base se conserva.

Los casos automatizados adicionales cubren presupuestos de holgura, descansos largos, capacidad reducida, días pausados, DST en horarios temporales, cuotas semanales, instancias idempotentes, ventanas vencidas, renovación sin autoagendado, plantillas y aislamiento entre cuentas.

## Sesiones, accesibilidad y configuración regional

La migración `20261009030000_sessions_locale` ya está aplicada en la base local. Las cookies antiguas sin registro de dispositivo requieren volver a iniciar sesión. Las suscripciones push anteriores se conservan y se muestran como dispositivos anteriores: el botón «Cerrar los demás dispositivos» permite retirarlas desde su cuenta.

1. Abre tu cuenta en dos navegadores o en una ventana privada. En **Ajustes → Sesiones activas** aparecen por separado, con navegador/sistema aproximados, inicio, última actividad y caducidad. La actividad se actualiza como máximo cada cinco minutos; las sesiones caducan siete días después del inicio. No se guarda la IP ni el agente de navegador completo.
2. Cierra una sesión desde la otra y recarga la agenda del dispositivo cerrado: debe volver al login. Sus consultas privadas también deben fallar y sus avisos push se retiran. «Cerrar los demás» conserva el dispositivo actual; cerrar el actual vuelve al login. Cambiar o restablecer contraseña revoca todas las sesiones y sus suscripciones push. Una copia offline ya descargada puede seguir visible sin conexión hasta terminar el día; se elimina al volver a conectar o salir localmente.
3. En **Ajustes → Idioma y calendario**, cambia a inglés, 12 horas y domingo. Recarga el segundo dispositivo: las preferencias de la cuenta deben aparecer allí también. Las fechas y horas respetan tu zona horaria; los controles nativos de fecha/hora siguen el formato del navegador y guardan valores normalizados. Los títulos y notas existentes no se traducen.
4. En **Semana** y **Revisión**, comprueba que el rango empieza en domingo. Las cuotas semanales y estadísticas usan la misma semana. Cambiar el primer día libera reservas flexibles futuras de hábitos semanales, preservando bloques fijos, iniciados y completados. Vuelve a organizar para regenerarlas. Las plantillas conservan trabajo de lunes a viernes y descanso el fin de semana, con independencia del primer día elegido.
5. El selector de idioma del login sirve antes de entrar; el idioma de la cuenta prevalece después. Los nuevos avisos push usan ese idioma sin cambiar su clave de deduplicación. La copia offline del día conserva idioma, reloj y tema de la última sincronización.
6. Recorre login, navegación, formularios y sesiones con Tab/Shift+Tab. El primer enlace de la agenda permite **saltar al contenido**; el foco debe quedar visible. Comprueba avisos de error/guardado con lector de pantalla, zoom al 200 %, temas Claro/Nocturno/Sistema y movimiento reducido del sistema. El tema se conserva por navegador y la copia offline respeta la elección explícita.

Las pruebas automatizadas cubren revocación, aislamiento, caducidad, actividad limitada, retirada de push, cookies reutilizadas tras logout, inglés, formatos y DST, cuotas desde domingo, conservación de historial y copia offline traducida.

## Header compacto y configuración de avisos

- En escritorio comprueba que solo se muestran marca, seis enlaces y avatar. Abre el avatar para cambiar tema, acceder a sesiones o salir.
- En móvil desplaza la fila de navegación; la página no debe desbordarse horizontalmente. El menú debe caber dentro de la pantalla.
- Con teclado abre el avatar, recorre los controles y pulsa Escape: el menú se cierra y devuelve el foco al avatar. También se cierra al salir del foco o tocar fuera.
- Con las tres variables VAPID configuradas, Ajustes permite activar el dispositivo. Acepta el permiso personalmente y comprueba que el contador se actualiza al activar/desactivar. Sin claves, muestra el estado pendiente y permite guardar preferencias.
- `npm test` cubre la generación persistente, la conservación de claves y de otras variables, los contactos inválidos, las parejas incompatibles y la exclusión de escrituras simultáneas.

Validación de estos cambios locales: 69 pruebas unitarias, 32 comprobaciones HTTP, ESLint y compilación de producción. Header revisado en Chrome a 1110, 768 y 390 píxeles, en claro y nocturno; menú, Escape, foco y tema comprobados sin errores de JavaScript. La recepción real de avisos queda pendiente de activar un dispositivo y probarla con su navegador.

## Probar transparencia y aprendizaje

1. En Ajustes crea «Estudio · 5 h/semana». En Bandeja asigna esa categoría a una tarea; en Hábitos puedes asignarla también a una rutina.
2. Captura otra tarea, escoge mañana y calcula la vista previa. Comprueba que aún no existe en la bandeja y que se muestran el antes, el después y los pendientes. Confirma y revisa la agenda de esa fecha.
3. Pulsa deshacer: el horario anterior debe volver y la tarea añadida quedar en la bandeja. Repite la replanificación, edita o completa un bloque y comprueba que no se puede sobrescribir ese cambio al deshacer.
4. Aplaza una tarea en tres bloques distintos: omitir o desagendar cuenta una vez por bloque. Replanificar sin aplazarla no cuenta. Revisa dividir, reducir, delegar o retirar desde su tarjeta. «Mantener como está» espera otros tres aplazamientos.
5. En la agenda de hoy abre el chequeo. Marca una tarea hecha con 25 minutos reales y otra para mañana; guarda ambas decisiones. El primer bloque conserva los minutos y el segundo vuelve a la bandeja. Una edición simultánea debe bloquear el guardado completo.
6. Da feedback de sobrecarga y replanifica: la capacidad y la explicación muestran la holgura adicional. Repetir feedback hoy no duplica la señal. Para mala hora, elige una franja; para mala estimación, elige un bloque y minutos. La duración base se conserva.
7. Revisa el objetivo de categoría al generar varios días de la semana, con días especiales y con una reserva omitida. Debe mostrar el déficit sin duplicar minutos de tareas categorizadas. Prueba semanas desde domingo y desde lunes, con DST y cambio de zona.

Las pruebas de transparencia incluyen rollback completo de vista previa (también materialización recurrente), confirmación concurrente, tokens modificados/caducados/de otra cuenta, deshacer con identificadores originales, bloqueo por ediciones o tiempo transcurrido, aplazamientos sin duplicación, resoluciones concretas, cierre diario atómico, señal del chequeo corregida sin borrar feedback explícito y recuperación de presupuestos semanales.

Validación de transparencia: 73 pruebas unitarias, 64 de integración y 36 comprobaciones HTTP. Compilación, ESLint y TypeScript correctos. Prueba de navegador con cuentas temporales: vista previa/confirmación, deshacer, feedback, chequeo conjunto, delegación y creación de categorías; revisión en móvil e inglés sin errores de JavaScript.
