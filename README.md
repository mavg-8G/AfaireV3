# Afaire

Planificador diario para varias personas. Cada cuenta tiene su agenda privada: citas fijas, hábitos, tareas pendientes y planificación automática en los huecos disponibles.

## Lo que puedes hacer

- Registrarte y configurar tu zona horaria, disponibilidad por día y descansos.
- Elegir rutinas iniciales o crear hábitos con duración, prioridad y momento preferido.
- Agendar citas, incluyendo las que terminan el día siguiente.
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

Next.js 16.4 App Router, React 19, TypeScript, Tailwind 4, PostgreSQL y Prisma 6.19.3. Auth.js/NextAuth 4.24.15 gestiona las sesiones JWT en cookies. La versión estable de Prisma se fijó para mantener cliente, esquema y migraciones compatibles; no se utiliza la versión preliminar que había inicialmente.

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
```

Las pruebas de integración necesitan la base configurada y migrada. Crean cuentas con emails bajo `test.invalid` y eliminan únicamente sus propios datos al terminar. Incluyen generación repetida y concurrente, conservación de bloques, tareas futuras, arrastre, aislamiento de cuentas, restricciones PostgreSQL y worker.

El build no necesita una base accesible: las páginas privadas se renderizan al recibir la petición. Los tests de integración y los flujos web sí necesitan PostgreSQL.

## VPS y actualizaciones desde GitHub

La guía [ops/DEPLOYMENT.md](ops/DEPLOYMENT.md) incluye la instalación en `afaire.espectro.uk`, integración con tu Caddy existente y publicación de imágenes con GitHub Actions/GHCR. Después de subir el código y esperar a que Actions termine, actualiza desde el VPS con:

```sh
sh /opt/afaire/scripts/update.sh
```

El servidor descarga imágenes del mismo commit, crea un respaldo, aplica migraciones y verifica web y worker. No necesita compilar ni copiar archivos manualmente. `.env` y el volumen PostgreSQL se conservan. Si una migración falla, los servicios quedan detenidos para su revisión.

Los servicios son `afaire-web`, `worker`, `migrate` y `db`; `caddy` es opcional. Por defecto no hay puertos publicados para la web ni para PostgreSQL. `docker-compose.proxy.yml` conecta solo la web a la red de tu proxy Docker; `docker-compose.host.yml` publica la web en loopback para un proxy del host. No actives un segundo Caddy si ya usas 80/443.

```sh
docker compose ps
docker compose logs --tail=100 afaire-web worker
```

## Instalación como webapp y seguridad

El botón **Instalar Afaire** permite instalar la PWA o muestra los pasos correspondientes al navegador. Incluye manifest, iconos y pantalla genérica sin conexión. La agenda requiere conexión; el service worker no almacena información privada.

Consulta [SECURITY.md](SECURITY.md) para cookies, CSP, protección de mutaciones, límites de acceso, secretos y seguridad Docker. La instalación en producción requiere HTTPS. Para comprobar HTTP con la web y PostgreSQL activos: `npm run test:web`.

## Copias y recuperación

Copia manual:

```sh
sh scripts/backup.sh
```

Guarda dumps de formato custom en `backups/`, con permisos restrictivos y retención local de 14 días. Copia al menos uno a un destino externo al VPS. Para programarlo, adapta la ruta `/opt/afaire` en los archivos de `ops/`, instálalos en `/etc/systemd/system/` y ejecuta:

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
- `src/lib/calendar.ts`: validación de horarios, propiedad y estados.
- `src/lib/transaction.ts`: bloqueo por usuario compartido por todas las mutaciones de agenda.
- `prisma/migrations`: esquema y restricciones de solapamientos, identidad y relaciones entre cuentas.
- `scripts`: worker, base local, recuperación de cuentas y backups.
- `tests`: pruebas unitarias y de integración.

## Estado y límites

La aplicación y el worker se comprueban localmente con PostgreSQL. Docker Compose y Caddy se entregan configurados; la ejecución de contenedores debe validarse en un host con Docker disponible.

Las sesiones, consultas y mutaciones están aisladas por usuario. PostgreSQL impide solapamientos y vínculos de agenda entre cuentas. Los intentos de acceso se limitan mediante contadores persistentes. El despliegue inicial se configura por invitación.

La auditoría de dependencias de producción no presenta avisos conocidos en la comprobación realizada. El tooling de desarrollo conserva un aviso de `braces` sin versión corregida publicada; no se aplica un downgrade incompatible de Next.js para ocultarlo.

Se dejan para siguientes iteraciones: arrastrar bloques, citas recurrentes, preferencias horarias personalizadas, turnos iniciales que cruzan medianoche, dividir tareas, correo de recuperación, ICS, notificaciones e integración con calendarios externos. Las franjas de madrugada aprendidas ya están implementadas. El [plan original](PLAN.md) documenta la evolución prevista; este README describe lo implementado.
