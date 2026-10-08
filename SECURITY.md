# Seguridad de Afaire

Las sesiones y operaciones de agenda se validan por usuario; las restricciones de PostgreSQL también protegen relaciones entre cuentas y solapamientos. Las contraseñas se almacenan con hash, las cookies son HttpOnly/SameSite y Secure en HTTPS. Cambiar o restablecer contraseña invalida sesiones anteriores.

Las páginas usan CSP con nonce por respuesta, protección contra framing y headers de privacidad. Las mutaciones rechazan orígenes ajenos y los intentos de autenticación tienen límites persistentes. El modo de registro predeterminado requiere invitación. Los secretos de ejemplo se rechazan al iniciar. `TRUST_PROXY=true` requiere un proxy que sobrescriba `X-Afaire-Client-IP`; no expongas directamente ese servicio a clientes externos.

La PWA almacena únicamente iconos y una página genérica sin conexión. No guarda agendas, respuestas de API, sesiones ni páginas privadas en Cache Storage. La agenda requiere conexión y autenticación. Instala desde HTTPS; el menú de instalación depende del navegador.

Los contenedores web y worker ejecutan sin privilegios, con filesystem de solo lectura y capacidades restringidas. La base no publica puertos. El despliegue verifica imágenes de un mismo commit y respalda datos antes de migrar. Mantén Docker, Caddy, sistema operativo y dependencias actualizados; guarda copias fuera del servidor.

Las comprobaciones incluyen aislamiento entre cuentas, CSRF/origen, cookies, CSP, límites concurrentes y privacidad de la caché PWA. La auditoría de producción realizada no mostró avisos conocidos; las verificaciones no garantizan ausencia de vulnerabilidades. La ejecución Docker debe comprobarse en un host con Docker. Para registro público todavía falta verificación y recuperación por correo.
