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
git clone https://github.com/mavg-8G/AfaireV3.git /opt/afaire
cd /opt/afaire
cp ops/production.env.example .env
chmod 600 .env
nano .env
```

Reemplaza los valores `CHANGE_` con secretos aleatorios, por ejemplo con `openssl rand -hex 32`. Mantén `NEXTAUTH_URL=https://afaire.espectro.uk`, registro por invitación y `TRUST_PROXY=true`. Define `PROXY_NETWORK` con el nombre real de la red Docker donde está tu Caddy existente: puedes consultarlo con `docker network ls` y `docker inspect NOMBRE_CONTENEDOR_CADDY`. La plantilla combina el compose base y el de proxy; solo la web se conecta a esa red. PostgreSQL no publica puertos.

Apunta el DNS de `afaire.espectro.uk` al VPS. El archivo `ops/Caddyfile.existing-proxy` conserva tus servicios, incluido `main.espectro.uk -> app:13052`, y añade `afaire.espectro.uk -> afaire-web:3000`. No actives otro Caddy en 80/443.

```sh
sh scripts/update.sh
sudo cp /opt/docker/proxy/Caddyfile /opt/docker/proxy/Caddyfile.backup
sudo cp ops/Caddyfile.existing-proxy /opt/docker/proxy/Caddyfile
docker exec NOMBRE_CONTENEDOR_CADDY caddy validate --config /etc/caddy/Caddyfile
docker exec NOMBRE_CONTENEDOR_CADDY caddy reload --config /etc/caddy/Caddyfile
```

Sustituye el nombre del contenedor y verifica que su montaje corresponda a esa ruta antes de copiar. Si la validación falla, restaura la copia. Caddy sobrescribe `X-Afaire-Client-IP` con la IP de la conexión: esa cabecera permite limitar accesos sin confiar en valores enviados por el navegador. Si existe una CDN delante, configura sus proxies de confianza antes de usar la IP real. Los headers comunes evitan imponer CSP o restricciones de subida a los otros servicios.

## Actualizar

Después de subir cambios y esperar a que Actions termine:

```sh
sh /opt/afaire/scripts/update.sh
```

El script exige un checkout limpio, actualiza con fast-forward, descarga web/worker/migraciones del mismo commit y comprueba sus etiquetas. Hace un respaldo si ya existe una base, detiene web y worker, aplica migraciones y espera sus healthchecks. Guarda `AFAIRE_VERSION` en `.env` al finalizar; conserva los demás secretos y el volumen. Un fallo al descargar deja la versión anterior funcionando. Un fallo después de detener servicios los deja detenidos para evitar ejecutar código incompatible con una migración parcial. Revisa `docker compose logs --tail=100 afaire-web worker` y la salida de migraciones antes de intervenir.

No hay rollback automático de datos, ni actualizaciones mayores automáticas de PostgreSQL. Prueba la restauración documentada en el README y conserva respaldos fuera del VPS. No ejecutes `docker compose down -v` sobre datos que deseas conservar.

Para construir localmente en lugar de GHCR: `docker compose up -d --build`. Si tu proxy corre directamente en el host, usa `docker-compose.host.yml` en lugar del override de red. Para Caddy incluido, utiliza solo el compose base, `TRUST_PROXY=true`, configura `DOMAIN` y activa el perfil `https`.
