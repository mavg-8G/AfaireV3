# Seguridad de Afaire

Las sesiones y operaciones de agenda se validan por usuario; las restricciones de PostgreSQL también protegen relaciones entre cuentas y solapamientos. Las contraseñas se almacenan con hash, las cookies son HttpOnly/SameSite y Secure en HTTPS. Cada inicio de sesión crea un registro de dispositivo que se valida en las consultas privadas. Se puede revocar una sesión o todas las demás desde Ajustes; reutilizar su cookie no recupera el acceso. Caducan siete días después del inicio y la actividad se actualiza como máximo cada cinco minutos. Solo se guarda una descripción aproximada de navegador/sistema y fechas, sin IP ni agente de navegador completo. Cambiar o restablecer contraseña invalida todas las sesiones y retira sus suscripciones push.

Las páginas usan CSP con nonce por respuesta, protección contra framing y headers de privacidad. Las mutaciones rechazan orígenes ajenos y los intentos de autenticación tienen límites persistentes. El modo de registro predeterminado requiere invitación. Los secretos de ejemplo se rechazan al iniciar. `TRUST_PROXY=true` requiere un proxy que sobrescriba `X-Afaire-Client-IP`; no expongas directamente ese servicio a clientes externos.

La PWA almacena iconos, una página genérica y una sola copia autenticada de hoy en Cache Storage del dispositivo. Esa copia contiene títulos, horarios, estados y ubicaciones, sin notas, credenciales ni cookies. Caduca al finalizar el día local y se borra al cerrar sesión, abrir login/registro o detectar una sesión inválida. El service worker genera HTML de lectura escapando el contenido y con CSP sin scripts ni formularios; no guarda documentos HTML, otras respuestas API ni mutaciones. Sin conexión no se puede validar una revocación remota de sesión: quien acceda al mismo perfil del navegador podrá leer la copia hasta su borrado o caducidad. Instala desde HTTPS; el menú de instalación depende del navegador.

Las suscripciones push se validan y pertenecen a una cuenta y versión de sesión; las nuevas también se vinculan a un dispositivo concreto. Cerrar ese dispositivo retira sus avisos. Las suscripciones anteriores sin vínculo se conservan y pueden retirarse por su propietario con «Cerrar los demás dispositivos». Solo se admiten endpoints HTTPS de los proveedores de Chrome, Firefox, Safari y Windows para evitar peticiones del servidor a destinos arbitrarios. Las claves VAPID privadas permanecen en el servidor. Los avisos pueden mostrar títulos en la pantalla bloqueada. La desactivación borra entregas vinculadas; el historial restante se elimina a los siete días.

Los contenedores web y worker ejecutan sin privilegios, con filesystem de solo lectura y capacidades restringidas. La base no publica puertos. El despliegue verifica imágenes de un mismo commit y respalda datos antes de migrar. Mantén Docker, Caddy, sistema operativo y dependencias actualizados; guarda copias fuera del servidor.

Las comprobaciones incluyen aislamiento entre cuentas, CSRF/origen, cookies, CSP, límites concurrentes y privacidad de la caché PWA. La auditoría de producción realizada no mostró avisos conocidos; las verificaciones no garantizan ausencia de vulnerabilidades. La ejecución Docker debe comprobarse en un host con Docker. Para registro público todavía falta verificación y recuperación por correo.

## Informe de dependencias del 22 de octubre de 2026

El informe de Dockhand corresponde a una imagen anterior (`5704b649896509e773b62d90e9cdf10388ad4d51`). Los cambios del repositorio requieren construir y desplegar imágenes nuevas; no modifican las ya publicadas.

| Componente del informe | Tratamiento |
| --- | --- |
| Next.js | `next` y `eslint-config-next` fijados a 16.4.2; `sharp` resuelto a 0.35.5. |
| brace-expansion | El lockfile ya resuelve 5.0.12 y 1.1.21, versiones corregidas de ambas ramas utilizadas. |
| undici, ip-address, postcss-selector-parser, http-cache-semantics | No están en el árbol de dependencias del proyecto. Se elimina npm/npx y Yarn de ambas imágenes finales para retirar sus árboles independientes; no basta con overrides del proyecto para actualizar dependencias globales. Confirmar su ausencia con un escaneo de ambas imágenes nuevas. |
| zlib, musl y musl-utils | La construcción actualiza los paquetes Alpine y exige al menos 1.3.2-r1 para zlib y 1.2.6-r3 para musl/musl-utils. Si el repositorio Alpine no ofrece esas revisiones, el build falla. CI actualiza también la imagen base con `--pull`. |
| busybox, busybox-binsh y ssl_client | CVE-2025-60876 continúa pendiente: el informe no ofrece versión corregida. Se conservan los paquetes del sistema y no se oculta la alerta. El arranque y los healthchecks de la aplicación usan Node, no wget; esto no equivale a parchear BusyBox. |

La auditoría npm de producción y el escaneo del sistema operativo cubren árboles diferentes. La auditoría completa también detecta `braces` (GHSA-vfj7-8cjw-p6xm) mediante las herramientas ESLint de desarrollo; no se incluye en el runtime standalone y no se debe degradar Next.js para silenciarla. Volver a comprobar su parche al actualizar las herramientas. Docker, Trivy y Grype no están disponibles en este entorno local: el resultado final de la imagen debe verificarse en un host que los tenga instalados.

Los comandos administrativos de contenedor se invocan con `node dist/admin/reset-password.cjs usuario@ejemplo.com` y `node dist/admin/generate-push-keys.cjs`. Los comandos npm siguen disponibles en el checkout de desarrollo.

## Vista previa y restauración de planes

La vista previa revierte todas sus escrituras. La confirmación valida un token firmado con AUTH_SECRET, la cuenta, el contenido de tarea, el estado actual de agenda y una caducidad máxima de cinco minutos. Confirmar, deshacer, registrar feedback, resolver aplazamientos y cerrar un día utilizan el bloqueo por cuenta y verifican propiedad en el servidor. El cierre diario comprueba versiones de bloque y se aplica en una sola transacción. Deshacer restaura solo bloques automáticos modificados que siguen pendientes y sin empezar; no sobreescribe ediciones posteriores. El historial guarda 30 snapshots compactos de cambios por cuenta y se elimina al eliminar la cuenta.
