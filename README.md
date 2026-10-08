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

## VPS con Docker Compose

Requiere Docker Engine y Compose v2. Copia el proyecto y crea `.env` desde la plantilla. Configura:

| Variable | Uso |
| --- | --- |
| `POSTGRES_PASSWORD` | Contraseña fuerte y URL-safe; se recomienda hexadecimal. |
| `POSTGRES_USER`, `POSTGRES_DB` | Usuario y nombre de base; por defecto `afaire`. |
| `AUTH_SECRET` | Secreto aleatorio de al menos 32 bytes. |
| `NEXTAUTH_URL` | URL pública completa: `https://agenda.tudominio.com`. |
| `DOMAIN` | Dominio sin protocolo, para Caddy. |
| `REGISTRATION_MODE` | `invite` para usuarios invitados o `open` para registro sin código. |
| `REGISTRATION_CODE` | Código privado que tú compartes con tus invitados. |
| `APP_PORT` | Puerto local del host para un proxy existente; por defecto 3000. |

Compose construye la conexión interna a PostgreSQL con las variables `POSTGRES_*`; el `DATABASE_URL` local de la plantilla no se usa en los contenedores.

### Con Caddy incluido

Apunta el DNS del dominio al VPS y permite 80/443. Después:

```sh
docker compose --profile https up -d --build
```

Caddy gestiona HTTPS. PostgreSQL queda en una red interna sin puerto público. La app también se publica en `127.0.0.1:3000` para facilitar diagnóstico local; no se expone directamente a Internet.

### Con Nginx o Caddy existente

No actives el perfil HTTPS:

```sh
docker compose up -d --build
```

Configura tu proxy hacia `http://127.0.0.1:3000`. Debe conservar el Host y enviar `X-Forwarded-Proto` y `X-Forwarded-For`. Usa la URL HTTPS real en `NEXTAUTH_URL`.

### Servicios y comprobaciones

- `db`: PostgreSQL con volumen persistente y comprobación de disponibilidad.
- `migrate`: aplica las migraciones y termina. La app y el worker esperan a que finalice correctamente.
- `app`: Next.js standalone, usuario sin privilegios y `/api/health`.
- `worker`: el mismo runtime, ejecutando el planificador cada minuto. Un plan ya existente no se regenera automáticamente.
- `caddy`: proxy opcional con volúmenes para certificados.

```sh
docker compose ps
docker compose logs --tail=100 app worker migrate
curl -f http://127.0.0.1:3000/api/health
```

El worker mantiene un heartbeat en PostgreSQL, utilizado por su healthcheck. Reintenta fallos con una espera creciente de hasta cinco minutos. Tras reiniciarse solo recupera el día actual si aún queda disponibilidad.

### Actualizaciones

Construye las nuevas imágenes antes de detener los servicios y crea una copia de datos. Para aplicar una actualización con una única ejecución de migraciones:

```sh
docker compose build
sh scripts/backup.sh
docker compose stop app worker
docker compose run --rm migrate
docker compose up -d --no-deps app worker
```

Si la migración falla, no arranques la nueva versión; conserva la copia y revisa los logs. No uses `prisma db push` en producción. Cambiar de imagen no revierte cambios de datos.

Una máquina con 2 vCPU y 2–4 GB de RAM es un punto de partida para pocos usuarios. Construir las imágenes fuera del VPS reduce el pico de memoria; ajusta los recursos después de medir el uso real.

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
