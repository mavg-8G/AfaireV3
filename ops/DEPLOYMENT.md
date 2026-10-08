# Afaire en afaire.espectro.uk

GitHub Actions verifica el proyecto y publica dos imágenes en GHCR con el SHA completo del commit. El VPS descarga esa versión; no necesita Node ni compilar. Nunca subas `.env`, backups ni datos de PostgreSQL al repositorio.

## Publicar el código una vez

El repositorio remoto tenía solamente el README al preparar esta configuración. Desde el proyecto local:

```sh
git add .
git commit -m "Implement Afaire with PWA and Docker updates"
git push origin main
```

Espera a que termine correctamente el workflow en la pestaña Actions. Las imágenes de GHCR pueden ser privadas inicialmente aunque el repositorio sea público. En Packages, haz públicas **ambas** imágenes si deseas descargas anónimas. Para mantenerlas privadas, usa en el VPS `docker login ghcr.io -u mavg-8G` y un token clásico con `read:packages` como contraseña. No guardes ese token en Git ni en `.env`. Un repositorio privado también requiere acceso de lectura para `git clone`/`fetch`.

## Instalar en el VPS

Requiere Docker Engine, Compose v2 reciente, Git y `flock` (util-linux). Usa siempre la misma carpeta y nombre de proyecto Compose para conservar el volumen de datos.

```sh
git clone https://github.com/mavg-8G/AfaireV3.git /opt/docker/afaire
cd /opt/docker/afaire
cp ops/production.env.example .env
chmod 600 .env
nano .env
```

Reemplaza los valores `CHANGE_` con secretos aleatorios, por ejemplo con `openssl rand -hex 32`. Mantén `NEXTAUTH_URL=https://afaire.espectro.uk`, registro por invitación y `TRUST_PROXY=true`. Define `PROXY_NETWORK` con el nombre real de la red Docker donde está tu Caddy existente: puedes consultarlo con `docker network ls` y `docker inspect NOMBRE_CONTENEDOR_CADDY`. La plantilla combina el compose base y el de proxy; solo la web se conecta a esa red. PostgreSQL no publica puertos.

Apunta el DNS de `afaire.espectro.uk` al VPS. Este proyecto usa tu contenedor `caddy` existente y no crea otro proxy. Consulta sus redes y el montaje del Caddyfile:

```sh
docker inspect caddy --format '{{json .NetworkSettings.Networks}}'
docker inspect caddy --format '{{json .Mounts}}'
```

Define `PROXY_NETWORK` en `.env` con la red compartida del proxy. Haz una copia del Caddyfile real y añade únicamente el bloque de `ops/Caddyfile.existing-proxy`, conservando todos los demás sitios y la configuración global. No reemplaces el archivo completo con ese fragmento.

```sh
sh scripts/update.sh
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

Verifica en el montaje que la ruta interna del archivo sea `/etc/caddy/Caddyfile`; adapta los comandos si es distinta. Recarga solo si la validación termina correctamente. El bloque de Afaire sobrescribe `X-Afaire-Client-IP` con la IP de la conexión para usar `TRUST_PROXY=true`.

## Actualizar

Después de subir cambios y esperar a que Actions termine:

```sh
sh /opt/docker/afaire/scripts/update.sh
```

El script exige un checkout limpio, actualiza con fast-forward, descarga web/worker/migraciones del mismo commit y comprueba sus etiquetas. Hace un respaldo si ya existe una base, detiene web y worker, aplica migraciones y espera sus healthchecks. Guarda `AFAIRE_VERSION` en `.env` al finalizar; conserva los demás secretos y el volumen. Un fallo al descargar deja la versión anterior funcionando. Un fallo después de detener servicios los deja detenidos para evitar ejecutar código incompatible con una migración parcial. Revisa `docker compose logs --tail=100 afaire-web worker` y la salida de migraciones antes de intervenir.

No hay rollback automático de datos, ni actualizaciones mayores automáticas de PostgreSQL. Prueba la restauración documentada en el README y conserva respaldos fuera del VPS. No ejecutes `docker compose down -v` sobre datos que deseas conservar.

## Arrancar las imágenes publicadas

El compose y la plantilla conservan como base el tag `cb5765639cda3e02a7c3b2f4f23e605bd8f227f0`. Las mejoras nuevas necesitan las imágenes del commit actualizado, publicadas cuando GitHub Actions termina correctamente. En una instalación existente, `scripts/update.sh` elige automáticamente el SHA de `origin/main`, respalda los datos y aplica las migraciones. Para una instalación inicial del checkout actualizado, exporta su SHA antes de descargar imágenes.

Con `.env` y la red del proxy configurados, para una instalación inicial:

```sh
export AFAIRE_VERSION=$(git rev-parse HEAD)
docker compose pull
docker compose up -d --no-build
docker compose ps -a
docker compose logs --tail=100 migrate afaire-web worker
```

Compose espera a que PostgreSQL esté disponible, ejecuta `prisma migrate deploy` y arranca web y worker únicamente si las migraciones terminan correctamente. Para actualizar una instalación con datos, utiliza `scripts/update.sh`, que hace el respaldo y detiene los servicios antes de migrar.

Las imágenes se construyen en GitHub Actions mediante el `Dockerfile`. El VPS utiliza las imágenes publicadas en GHCR y tu proxy Docker existente.

## Instalación existente sin checkout Git

Si el servidor solo contiene `.env` y `docker-compose.yml`, usa `ops/update-standalone.sh` colocado en esa misma carpeta y ejecútalo con `sudo sh ./update-standalone.sh SHA_COMPLETO_PUBLICADO`. No necesita permiso ejecutable. El actualizador conserva el Compose original y sus volúmenes, valida las imágenes antes de detener servicios, respalda PostgreSQL y aplica migraciones. Guarda la versión y `COMPOSE_FILE` en `.env`, y añade `docker-compose.update.yml` con las imágenes y la configuración push. La versión debe tener imágenes publicadas en GHCR. Requiere los servicios `db`, `afaire-web`, `worker` y `migrate` y Docker Compose v2.

## Configurar Web Push

Genera una vez las claves con `npm run push:keys` (también puede ejecutarse en la imagen migrate). Guarda `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT=https://afaire.espectro.uk` en el `.env` del servidor; conserva el par en los siguientes despliegues. Compose las entrega a web y worker. El worker ahora usa también la red `edge` para acceder por HTTPS a los proveedores push. No se añade un puerto público al worker ni a PostgreSQL.

Aplica la migración aditiva antes de iniciar esta versión. En Ajustes, activa el dispositivo y acepta su permiso; en iOS abre la PWA instalada. Comprueba un aviso real en cada plataforma. Ajustes muestra heartbeat, generaciones fallidas y entregas con error. Revisa `docker compose logs --tail=100 worker` si no avanza la señal. Sin las claves VAPID, el resto de funciones sigue disponible.
