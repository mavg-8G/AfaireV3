# Afaire 2

Guía de pruebas de agenda, avisos, capacidad del planificador y sesiones: consulta [TESTING.md](TESTING.md).

Versión 3.0.0. Apariencia clara, nocturna o automática según el sistema, con selección guardada por navegador. El selector Tema está disponible en la cabecera y al iniciar sesión. La vista sin conexión sigue el tema del sistema.

Planificador diario para varias personas. Cada cuenta tiene su agenda privada: citas fijas, hábitos, tareas pendientes y planificación automática en los huecos disponibles.

Las tareas pueden habilitar «Permitir dividir en varios bloques» y elegir un fragmento mínimo (30 min por defecto). Primero se busca un hueco continuo; si falta, se reserva todo el trabajo restante en fragmentos que respetan ese mínimo. Cada bloque comparte la tarea y muestra su índice. Completar, omitir o replanificar un fragmento conserva el trabajo ya hecho; la tarea termina cuando se completan todos. La división está desactivada por defecto, también para tareas profundas. Las tareas divisibles conservan su duración explícita como objetivo total; las mediciones de fragmentos no se usan como estimaciones de tareas completas.

En Ajustes, «Prioridad por urgencia» permite activar el bonus y cambiar sus umbrales: un nivel a tres días y dos niveles a un día del vencimiento, con prioridad alta para las vencidas. Los esenciales siguen primero; después se usa la prioridad efectiva y los empates por vencimiento e identidad. «¿Por qué este bloque está aquí?» explica la prioridad base, la efectiva y la regla aplicada.

Las actividades sin espacio guardan un código de motivo en `DayPlan.details`, con propuestas verificadas para dividir, acortar, mover el vencimiento o liberar un bloque flexible concreto. Los botones aplican la decisión y recalculan el espacio conservando los bloques existentes. Si cambió la versión del plan, empezó el bloque o la propuesta ya no cabe, se rechaza sin cambios parciales. La migración `20261009110000_task_chunks_urgency` añade estos campos y permite varios fragmentos activos por tarea; se aplica con `npm run db:migrate`.

Última actualización: 8 de octubre de 2026. Consulta el [historial de cambios](CHANGELOG.md) para ver las novedades y los requisitos de actualización.

## Lo que puedes hacer

- Registrarte y configurar tu zona horaria, disponibilidad por día y descansos.
- Elegir rutinas iniciales o crear hábitos con duración, prioridad y momento preferido.
- Agendar citas, incluyendo las que terminan el día siguiente, con repetición diaria, semanal por días o mensual; editar solo una o esa y las siguientes.
- Reservar minutos de traslado antes de citas con ubicación.
- Recibir Web Push antes de un bloque, con el resumen del día y las tareas que vencen mañana.
- Consultar y editar los bloques de la última copia de hoy sin conexión, con una cola persistente de cambios.
- Registrar tiempos reales, ver rachas y cumplimiento de hábitos y cerrar la semana en Revisión.
- Marcar tareas profundas o ligeras y ajustar duraciones a partir del historial medido.
- Guardar tareas con fecha límite y editarlas antes de programarlas.
- Organizar hoy o una fecha futura; regenerar solo los bloques flexibles pendientes que todavía no empezaron.
- Fijar, mover, empezar, completar u omitir bloques. Las citas, los bloques completados y el historial se conservan.
- Consultar la semana y navegar por fechas.
- Activar la generación diaria aunque el navegador esté cerrado.
- Recuperar tareas flexibles pendientes de días anteriores sin duplicarlas.
- Aprender horarios y días disponibles a partir del uso repetido, incluyendo franjas de madrugada. Puedes pausar o reiniciar el aprendizaje en Ajustes.

El motor usa asignación determinista por huecos y no divide tareas. Si falta tiempo, muestra qué quedó pendiente y por qué. Mañana = 06:00–12:00, tarde = 12:00–18:00, noche = 18:00–24:00, siempre en la zona del usuario. La preferencia puede relajarse cuando no hay espacio en esa franja.

## Disponibilidad que aprende con el uso

Los horarios iniciales permiten usar la app desde el primer día. Con el aprendizaje activo, las visitas y la interacción con una pestaña visible registran una muestra por franja de 15 minutos, en la zona horaria del usuario. Una pestaña inactiva o en segundo plano no acumula actividad periódica.

- Una franja observada en tres fechas distintas puede ampliar la disponibilidad de los días en los que se ha observado ese uso. Por ejemplo, el uso repetido alrededor de la 1 a. m. añade una franja aproximada de 00:30–02:30 junto al horario inicial.
- Un día inicialmente desactivado necesita actividad en tres fechas de ese mismo día de semana para activarse automáticamente.
- Afinar horarios iniciales o desactivar días sin uso requiere al menos 12 fechas de actividad repartidas en tres semanas. Reducir una ventana además necesita varios días con actividad distribuida a lo largo de seis horas o más.
- El planificador respeta varias franjas separadas. El intervalo entre una sesión nocturna y el horario diurno permanece libre.
- Los nuevos horarios se aplican al próximo plan. Las citas y los planes existentes se conservan; puedes replanificar lo pendiente manualmente.
- Ajustes muestra qué se aprendió y el motivo. Pausar usa los horarios iniciales; reiniciar borra las muestras y vuelve a empezar. Cambiar de zona horaria también reinicia las muestras.

Se guardan únicamente fecha local, franja, zona y momento de observación, durante un máximo de 28 días cuando el worker está activo. No se registra el contenido de tareas, teclas, páginas externas ni movimientos del cursor; esas interacciones solo sirven para saber si la pestaña está activa. Este aprendizaje usa reglas estadísticas locales y no necesita un servicio externo de IA.

## Stack

Next.js 16.4 App Router, React 19, TypeScript 7, Tailwind 4, PostgreSQL y Prisma 7.10.0 con `@prisma/adapter-pg`. Auth.js/NextAuth 4.24.15 gestiona las sesiones JWT en cookies. El cliente Prisma se genera en `src/generated/prisma`; `prisma.config.ts` configura el esquema, las migraciones y la conexión del CLI. Las imágenes usan Node 26 Alpine.

TypeScript 7 se instala como `@typescript/native` y proporciona `tsc`; la API de TypeScript 6 se mantiene bajo el alias `typescript` para los plugins de ESLint y Next.js, según la configuración de coexistencia recomendada por Microsoft. ESLint 10 usa `@eslint/compat` para los plugins de Next.js que todavía emplean la API anterior. Se requiere Node.js 22.13 o posterior.

Instantes en UTC y PostgreSQL `timestamptz`; fechas del plan en el calendario local. El código rechaza horas inexistentes o ambiguas durante cambios de horario de verano y pide elegir una hora fuera de ese intervalo.

## Desarrollo local

Requiere Node.js 22.12 o superior; se ha verificado con Node 24. Para instalar:

```powershell
npm ci
Copy-Item .env.example .env
```

Edita `.env`: usa una contraseña aleatoria para `DATABASE_URL` y un secreto aleatorio para `AUTH_SECRET`. Un secreto se puede generar con:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Para acceso local sin invitación, establece `REGISTRATION_MODE=open`. Conserva `NEXTAUTH_URL=http://localhost:3000`.

Puedes usar tu propio PostgreSQL o iniciar la base de desarrollo incluida, que se escucha únicamente en loopback y guarda sus datos en `.local-db/data`:

```powershell
npm run db:local
```

Deja esa terminal abierta. En otra terminal:

```powershell
npm run db:migrate
npm run db:generate
npm run dev -- --hostname 127.0.0.1
```

Abre [Afaire local](http://localhost:3000), crea una cuenta y completa la configuración inicial. Para la generación sin abrir el navegador, en otra terminal:

```powershell
npm run worker
```

La base local incluida es solo una ayuda para desarrollo. Docker usa la imagen oficial de PostgreSQL. Para detener la base o el worker usa Ctrl+C. Los datos de la base local se conservan.

En Windows, detén la web y el worker antes de regenerar Prisma o cambiar dependencias: el proceso puede mantener abierto el DLL del motor. No elimines la carpeta de la base para corregir un fallo de compilación.

## Pruebas y build

Después de compilar, `npm start` sirve la salida standalone en `127.0.0.1:3000` y copia los recursos estáticos necesarios. Puedes definir `PORT` y `AFAIRE_HOSTNAME` para cambiar la escucha local. Docker inicia directamente su servidor standalone.

```powershell
npm test
npm run typecheck
npm run lint
npm run test:integration
npm run build
npm run worker:build
npm run admin:build
```

Las pruebas de integración necesitan la base configurada y migrada. Crean cuentas con emails bajo `test.invalid` y eliminan únicamente sus propios datos al terminar. Incluyen generación repetida y concurrente, conservación de bloques, tareas futuras, arrastre, aislamiento de cuentas, restricciones PostgreSQL y worker.

El aprendizaje de duración muestra el número de mediciones válidas y su mediana en las sugerencias y en la explicación de los bloques automáticos. En el formulario de tarea puedes elegir el mismo título, una plantilla de aprendizaje (usa el mismo nombre aunque cambie el título) o la misma categoría. Solo se usan bloques completos, con duración real entre 1 y 480 minutos y al menos el 10 % de la estimación de ese bloque; si no había estimación guardada, se compara con la duración programada. Se conservan las últimas diez mediciones válidas, se requieren tres y el ajuste se limita al 25 %.

Cada ciclo del worker toma `pg_try_advisory_lock` en una conexión PostgreSQL dedicada, durante planificación y push. Una segunda instancia omite el ciclo si no obtiene el lock. El cierre de la conexión libera el lock incluso si el ciclo falla; si se pierde la conexión durante el ciclo, el proceso termina para evitar seguir trabajando sin bloqueo. Requiere una conexión directa a PostgreSQL o un pool en modo sesión, no un pool en modo transacción.

En Ajustes aparecen el porcentaje de días planificados con tareas sin espacio (último plan por día), el tiempo medio de generación y la tasa de fallos push por intento, incluidos reintentos y dispositivos caducados. El período es de 30 días y empieza a acumular datos con esta migración; los fallos de procesamiento sin un intento de transporte no inflan la tasa push. El tiempo de generación mide el cálculo y las consultas hasta persistir el plan, sin incluir la espera inicial del lock de usuario ni el guardado posterior del historial.

La falta de heartbeat de `daily-planner` durante más de cinco minutos muestra una alerta en Ajustes. `GET /api/health/worker` devuelve 503 cuando falta la señal, está vencida o no hay conexión con la base, y 200 cuando está vigente. Se puede conectar este endpoint a tu monitor HTTP para recibir alertas externas. El healthcheck del contenedor usa el mismo umbral; `/api/health` sigue comprobando la disponibilidad de la web y la base.

Las pruebas de propiedades usan `fast-check` con semilla reproducible y 500 casos por garantía: sin solapamientos, sin bloques nuevos en el pasado, resultado determinista y conservación de las entradas fijadas. Las pruebas de integración también verifican estas garantías en la agenda persistida y la exclusión entre ciclos del worker. Los casos DST cubren Nueva York, Madrid, Lord Howe (cambio de media hora) y Santiago (cambio a medianoche), incluyendo citas nocturnas y repeticiones.

El build no necesita una base accesible: las páginas privadas se renderizan al recibir la petición. Los tests de integración y los flujos web sí necesitan PostgreSQL.

## VPS y actualizaciones desde GitHub

La guía [ops/DEPLOYMENT.md](ops/DEPLOYMENT.md) incluye la instalación en `afaire.espectro.uk`, integración con tu Caddy existente y publicación de imágenes con GitHub Actions/GHCR. Después de subir el código y esperar a que Actions termine, actualiza desde el VPS con:

```sh
sh /opt/docker/afaire/scripts/update.sh
```

El servidor descarga imágenes del mismo commit, crea un respaldo, aplica migraciones y verifica web y worker. No necesita compilar ni copiar archivos manualmente. `.env` y el volumen PostgreSQL se conservan. Si una migración falla, los servicios quedan detenidos para su revisión.

Los servicios son `afaire-web`, `worker`, `migrate` y `db`. Se utiliza tu Caddy existente. No hay puertos publicados para la web ni para PostgreSQL. `docker-compose.proxy.yml` conecta solo la web a la red `proxy` de tu Caddy.

La imagen compartida por web y worker contiene la salida standalone de Next.js, el worker compilado y el cliente nativo de Prisma. Las dependencias del worker se incluyen en su bundle; no se copia todo `node_modules` sobre la salida standalone. La imagen de migraciones se construye por separado con la CLI de Prisma y los comandos administrativos compilados, sin el servidor Next.js ni las herramientas de desarrollo. Los comandos `npm run account:reset` y `npm run push:keys` siguen disponibles en `migrate`.

Actions verifica el contenido mínimo y prueba ambas imágenes, incluidas las migraciones, HTTP y el heartbeat del worker con el sistema de archivos de solo lectura. También imprime el tamaño final en bytes. Para medirlas en un host con Docker:

```sh
docker build --target runtime -t afaire-runtime:local .
docker build --target migrate -t afaire-migrate:local .
docker image inspect afaire-runtime:local afaire-migrate:local --format '{{.RepoTags}}: {{.Size}} bytes'
```

```sh
docker compose ps
docker compose logs --tail=100 afaire-web worker
```

## Instalación como webapp y seguridad

La PWA se instala desde las opciones del navegador, sin un botón de instalación dentro de Afaire. Incluye manifest, iconos, pantalla genérica sin conexión y una copia privada del día actual. La copia se actualiza al visitar Hoy y cada minuto mientras está abierta; indica cuándo se guardó y caduca al terminar el día en la zona del usuario. Desde «Abrir agenda guardada y cambios pendientes» puedes cambiar estados y editar título, horario, ubicación, traslado y notas de bloques existentes. Cada edición afecta solo ese bloque y fija su horario; crear tareas, citas o modificar series requiere conexión.

Los cambios se guardan en una cola local persistente (hasta 200), sobreviven a las recargas y se envían en orden al recuperar la conexión, abrir la agenda o pulsar «Sincronizar ahora». Los reintentos usan identificadores idempotentes para evitar aplicar dos veces una operación. El servidor comprueba la sesión, la versión del bloque y los solapamientos; un conflicto conserva el cambio pendiente y muestra la versión actual para que puedas descartar los cambios de ese bloque y revisarlo. Los demás bloques siguen sincronizándose. Completar un bloque usa la hora registrada en el dispositivo para medir su duración.

La copia y la cola solo se guardan en ese dispositivo. La caducidad diaria elimina la copia, pero conserva los cambios pendientes; el servidor admite cambios registrados hasta siete días antes. Salir, visitar el acceso, cambiar de sesión o detectar una sesión inválida borra ambas. No se cachean páginas privadas ni credenciales; solo esta cola explícita permite escrituras sin conexión.

Consulta [SECURITY.md](SECURITY.md) para cookies, CSP, protección de mutaciones, límites de acceso, secretos y seguridad Docker. La instalación en producción requiere HTTPS. Para comprobar HTTP con la web y PostgreSQL activos: `npm run test:web`.

## Copias y recuperación

Copia manual:

```sh
sh scripts/backup.sh
```

Guarda dumps de formato custom en `backups/`, con permisos restrictivos y retención local de 14 días. Copia al menos uno a un destino externo al VPS. Para programarlo, adapta la ruta `/opt/docker/afaire` en los archivos de `ops/`, instálalos en `/etc/systemd/system/` y ejecuta:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now afaire-backup.timer
```

Restauración explícita, que reemplaza los datos actuales:

```sh
CONFIRM_RESTORE=YES sh scripts/restore.sh backups/afaire-FECHA.dump
```

El script realiza una copia antes de restaurar, detiene la web y el worker, restaura en una transacción y los vuelve a iniciar solo si termina correctamente. Verifica una restauración en una instancia de prueba antes de depender del procedimiento en producción. El script de restauración se ejecuta localmente en el VPS; no inicia restauraciones por su cuenta.

## Recuperación de una cuenta invitada

Si un usuario pierde su contraseña, el administrador puede restablecerla desde un terminal del servidor. La contraseña se solicita sin mostrarse ni almacenarse en el historial:

```sh
docker compose run --rm migrate npm run account:reset -- usuario@ejemplo.com
```

Todas las sesiones previas de esa cuenta quedan invalidadas. La recuperación y verificación por email requieren configurar un proveedor de correo y quedan pendientes para una apertura pública del registro.

## Estructura

- `src/app`: pantallas, acciones autenticadas y endpoints de Auth.js y salud.
- `src/lib/scheduler.ts`: motor puro de huecos y prioridades.
- `src/lib/planner.ts`: planificación transaccional y generación diaria.
- `src/lib/learning.ts` y `activity.ts`: aprendizaje con muestras de uso y actualización de disponibilidad.
- `src/lib/availability.ts`: franjas iniciales o aprendidas y conversión de sus horas locales.
- `src/lib/calendar.ts`: validación de horarios, propiedad, traslados y estados.
- `src/lib/recurrence.ts` y `series.ts`: reglas recurrentes, creación y edición transaccional de series.
- `src/lib/notifications.ts` y `push.ts`: avisos, suscripciones y entregas con reintentos.
- `src/lib/insights.ts`: rachas, franja de foco y estimaciones según tiempos reales.
- `public/sw.js`: caché pública, copia privada de hoy en lectura y recepción de avisos push.
- `src/lib/transaction.ts`: bloqueo por usuario compartido por todas las mutaciones de agenda.
- `prisma/migrations`: esquema y restricciones de solapamientos, identidad y relaciones entre cuentas.
- `scripts`: worker, base local, recuperación de cuentas y backups.
- `tests`: pruebas unitarias y de integración.

## Estado y límites

Validación local de esta actualización: 45 pruebas unitarias, 21 pruebas de integración con PostgreSQL y 20 comprobaciones HTTP aprobadas. También pasan TypeScript, ESLint, el build de producción y el empaquetado del worker. Web Push se verifica con un transporte simulado; la recepción real en dispositivos requiere configurar VAPID. Docker Compose y el bloque para tu Caddy existente se entregan configurados; la ejecución de contenedores debe validarse en un host con Docker disponible.

Las sesiones, consultas y mutaciones están aisladas por usuario. PostgreSQL impide solapamientos y vínculos de agenda entre cuentas. Los intentos de acceso se limitan mediante contadores persistentes. El despliegue inicial se configura por invitación.

La auditoría de dependencias de producción no presenta avisos conocidos en la comprobación realizada. El tooling de desarrollo conserva un aviso de `braces` sin versión corregida publicada; no se aplica un downgrade incompatible de Next.js para ocultarlo.

Se dejan para siguientes iteraciones: arrastrar bloques, recurrencias sin fecha final o con intervalos avanzados, preferencias horarias personalizadas, turnos iniciales que cruzan medianoche, dividir tareas, correo de recuperación, ICS e integración con calendarios externos. Las franjas de madrugada aprendidas ya están implementadas. El [plan original](PLAN.md) documenta la evolución prevista; este README describe lo implementado.

## Repetición, traslados y mediciones

La repetición requiere una fecha final, hasta 366 días desde el inicio (el formulario propone 90). Se reserva toda la serie dentro de una transacción: un conflicto deshace la creación completa. La mensual conserva el número del día y omite meses que no lo tengan. Los horarios inexistentes o ambiguos por DST se rechazan indicando la fecha; elige otra hora. Editar «solo esta» conserva la identidad de esa ocurrencia como excepción. «Esta y las siguientes» corta la serie anterior y crea otra, manteniendo el historial cancelado. Si esa parte contiene bloques completados o en curso, se pide editar solo la cita. Cambiar la zona de la cuenta conserva los instantes ya reservados; una serie nueva usa la zona actual.

El traslado es una estimación manual de 0–180 minutos antes de llegar a una ubicación, sin servicio de mapas. Evita conflictos al guardar citas y reserva ese intervalo más el descanso mínimo al planificar. La agenda muestra la ubicación y los minutos reservados.

«Empezar» y «Hecho» registran tiempo transcurrido en el servidor. Si completas directamente, puedes introducir minutos reales desde las opciones del bloque. No se inventa duración real a partir de la estimada. El ajuste automático se activa en Ajustes: necesita tres mediciones del mismo hábito o de tareas con el mismo título, usa hasta diez muestras y limita el cambio al 25 % respecto a la duración base, redondeado a cinco minutos. El bloque guarda la estimación utilizada; la definición original de tarea o hábito se conserva. Es una estimación para el plan, no un temporizador con pausas.

Las tareas profundas sin una preferencia horaria explícita buscan primero la franja de foco; entre tareas con igual prioridad y vencimiento se colocan antes que las ligeras. Las ligeras aprovechan los huecos restantes. Si no cabe en la franja preferida, el motor intenta otras. Puedes elegir mañana, tarde o noche, o usar las muestras de actividad (mínimo 12 en los últimos 28 días, por defecto mañana). El uso de la aplicación es una aproximación al foco, no una medición de energía.

Hábitos muestra racha y cumplimiento de la semana hasta hoy. La racha ignora días no previstos y no penaliza el día actual antes de terminar. Revisión abre la semana anterior y permite navegar; incluye bloques hechos, omitidos o pendientes de recuperar, actividades sin espacio, tiempo real vs. estimado por tarea y sugerencias que puedes aplicar desde Ajustes y Hábitos. Los denominadores usan los días actualmente configurados de cada hábito y su fecha de creación.

## Activar Web Push y revisar el worker

En local o en un checkout del servidor con dependencias instaladas, ejecuta `npm run push:setup -- --subject https://afaire.espectro.uk` (o usa tu URL HTTPS pública / `mailto:correo-de-contacto`). Este comando guarda la pareja y el contacto directamente en `.env`, sin mostrar secretos, conserva las claves existentes y rechaza parejas incompletas o incompatibles. Reinicia web y worker para cargarla. Para otro archivo utiliza `--env /ruta/.env`.

Si administras el VPS solo con las imágenes Docker, genera claves VAPID una vez con `docker compose run --rm --no-deps migrate npm run push:keys`. Guarda `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` (URL HTTPS pública o correo de contacto con prefijo `mailto:`) en el `.env` del servidor. No cambies las claves en cada actualización; la privada nunca llega al navegador. Compose las pasa a web y worker. El worker tiene salida HTTPS por la red edge para alcanzar los proveedores de los navegadores; PostgreSQL permanece en la red interna. Tras guardarlas, recrea ambos procesos con `docker compose up -d --force-recreate --no-deps afaire-web worker`. Sin las tres variables la app funciona y muestra los avisos como pendientes de configuración.

En Ajustes, activa este dispositivo y acepta el permiso del navegador. En iOS abre Afaire instalada en la pantalla de inicio ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). Puedes configurar cada aviso, antelación de 1–120 minutos y las horas locales del resumen y los vencimientos. Se admite hasta cinco dispositivos por cuenta, con desactivación individual o conjunta. Cerrar sesión desactiva esa suscripción local; invalidar sesiones retira las suscripciones de su versión anterior. Los títulos pueden aparecer en la pantalla bloqueada.

El worker comprueba cada minuto. Los avisos de bloque solo se envían antes de empezar, dentro de la antelación elegida. Con traslado, la antelación cuenta antes de salir y el aviso muestra los minutos hasta el inicio de la cita. Tras un reinicio, resumen y vencimientos se recuperan durante una hora desde su hora configurada; después se omiten para evitar avisos antiguos. Se registran entregas por dispositivo y aviso con una reclamación atómica de dos minutos y hasta cinco intentos; los éxitos no se repiten. Un corte después de que el proveedor acepte un envío y antes de registrar el éxito puede causar una repetición: el service worker usa una etiqueta estable para sustituir el aviso anterior. Las suscripciones 404/410 se eliminan; el historial de entrega se conserva siete días. El TTL de los mensajes es cinco minutos. La entrega final depende del proveedor, el dispositivo y la conexión.

Ajustes muestra la última señal del worker, las diez últimas generaciones de tu cuenta, errores push pendientes y los intentos. Los fallos de agenda quedan en PostgreSQL durante 30 días, con reintento por usuario de uno a cinco minutos. Los fallos de una cuenta no retrasan los avisos de las demás. Si la base no está disponible, el worker registra el fallo en logs y el heartbeat deja de avanzar; no puede guardar un registro en una base caída.

Las migraciones `20261009120000_learning_reliability` y `20261009130000_offline_changes` son aditivas y se aplican con `npm run db:migrate`. Las pruebas incluyen series y rollback, aislamiento entre cuentas, propiedades del planificador, medianoche, varias zonas y DST, traslados y descansos, foco, duraciones, persistencia de la cola offline, reintentos idempotentes, conflictos, caducidad y borrado de sesión, concurrencia push y recuperación del worker. Las entregas push se prueban con un transporte simulado; verifica una entrega real en cada dispositivo después de configurar VAPID y desplegar por HTTPS.

Las sesiones activas se gestionan en Ajustes, junto con idioma español/inglés, reloj de 12/24 horas y comienzo de semana lunes/domingo. Las instrucciones de prueba local están en [TESTING.md](TESTING.md).

## Vista previa, historial y aprendizaje explícito

En Bandeja, rellena una tarea y pulsa «Ver cómo cambiaría el plan». Puedes escoger hoy u otro día futuro. Se muestra el horario antes y después, las citas protegidas y las actividades sin espacio. Calcular la vista previa utiliza el motor real dentro de una transacción que se revierte: no guarda tareas, ocurrencias, reservas ni historial. «Confirmar tarea y aplicar este plan» guarda la tarea y replanifica en una sola operación. «Guardar en la bandeja» sigue disponible. Una vista previa caduca en cinco minutos; un cambio de tarea, agenda o tramo disponible requiere recalcularla.

La agenda muestra «Cambios del plan» y «Deshacer la replanificación» cuando es seguro restaurar el último plan de esa fecha. Se conservan 30 cambios por cuenta, con snapshots de los bloques y tareas modificados. No se restaura si hubo una edición posterior o algún bloque afectado ya empezó, terminó o fue fijado. Se recuperan los identificadores y horarios anteriores, las tareas pendientes y el modo del día. Las tareas recién capturadas se conservan en la bandeja. El historial registra también la restauración; no permite volver a aplicar un cambio ya deshecho.

Al omitir o desagendar una tarea, o recuperar un bloque automático pendiente del día anterior, se registra un aplazamiento por bloque. Replanificar el mismo día no incrementa el contador. Tras tres aplazamientos nuevos, Bandeja pregunta si quieres dividirla en dos pasos concretos, reducir su duración, delegarla, eliminarla o mantenerla. La delegación registra el responsable y retira esa tarea del autoagendado; se puede recuperar. Dividir una repetición afecta solo a esa tarea, conservando la definición de siguientes periodos.

Desde la agenda, «Chequeo de fin de día» abre /check-in para hoy o un día reciente. Puedes marcar varios bloques hechos, pospuestos, omitidos o pendientes y registrar minutos reales. Un guardado aplica todas las decisiones juntas, con comprobación de versiones y propiedad. Posponer u omitir tareas las prepara para mañana; una repetición con ventana vencida queda pendiente de revisión, sin extender automáticamente su periodo. Los hábitos mantienen sus días originales. Los minutos reales alimentan el ajuste existente de duraciones cuando está activado.

«Este plan no me sirvió» permite dar tres señales explícitas. Cada fecha con sobrecarga añade 5 puntos de holgura, hasta 20 adicionales y un máximo total del 50 %. Una mala hora puede indicar una franja para actividades sin preferencia explícita. Una mala estimación señala una duración para esa tarea o hábito, limitada al 25 % de su duración base. El motor usa las señales recientes durante 28 días y explica los ajustes en cada bloque; la capacidad y su previsión incluyen la holgura aprendida. Un chequeo lleno o difícil puede aportar la señal de sobrecarga mediante su casilla de aprendizaje; corregir ese chequeo elimina solo su propia señal, conservando el feedback explícito.

En Ajustes, «Presupuesto de tiempo por categoría» define objetivos semanales, por ejemplo 5 h de estudio. Asigna la categoría en formularios de tareas o hábitos. El motor prioriza tareas de categorías con déficit y reserva bloques flexibles de categoría para completar el objetivo en los días restantes de la semana, según su capacidad. Es un objetivo de dedicación, no un tope que retire urgencias. Citas, hábitos esenciales, tareas de alta prioridad, descansos, vacaciones y capacidad reducida se respetan. Agenda y Bandeja muestran minutos hechos, reservados y pendientes de asignar; los minutos reales reemplazan los estimados en bloques hechos. Las reservas incumplidas vuelven a considerarse déficit. Las semanas usan tu zona horaria y tu primer día configurado. Pausar un objetivo retira sus reservas automáticas futuras y conserva el trabajo realizado.
