import webpush from "web-push";
const keys = webpush.generateVAPIDKeys();
console.log("# Guarda estas claves en el .env del servidor; no las publiques ni las cambies en cada despliegue.");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("# VAPID_SUBJECT=https://tu-dominio-publico o mailto:tu-correo-de-contacto");
