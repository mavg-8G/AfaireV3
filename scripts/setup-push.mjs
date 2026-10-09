import { readFileSync, writeFileSync, openSync, closeSync, renameSync, unlinkSync, lstatSync } from "node:fs";
import { resolve } from "node:path";
import { createECDH, randomUUID } from "node:crypto";
import dotenv from "dotenv";
import webpush from "web-push";

// Run once against the shared .env, before starting web and worker. Never rotate an existing pair.
export function setupPush(args = process.argv.slice(2)) {
  let envPath = resolve(".env"), subjectOption;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--env" && args[i + 1]) envPath = resolve(args[++i]);
    else if (args[i] === "--subject" && args[i + 1]) subjectOption = args[++i];
    else throw new Error("Uso: npm run push:setup -- [--env ruta/.env] [--subject https://tu-dominio o mailto:contacto]");
  }
  if (!lstatSync(envPath).isFile() || lstatSync(envPath).isSymbolicLink()) throw new Error("Se necesita un archivo .env existente, sin enlaces simbólicos.");
  const lockPath = envPath + ".push-setup.lock";
  const lock = openSync(lockPath, "wx", 0o600);
  let temporary;
  try {
    const original = readFileSync(envPath, "utf8");
    const env = dotenv.parse(original);
    const hasPublic = Boolean(env.VAPID_PUBLIC_KEY), hasPrivate = Boolean(env.VAPID_PRIVATE_KEY);
    if (hasPublic !== hasPrivate) throw new Error("Hay una configuración VAPID incompleta. Recupera la pareja original antes de continuar; no se han cambiado las claves.");
    const subject = subjectOption || env.VAPID_SUBJECT || (env.NEXTAUTH_URL?.startsWith("https://") ? env.NEXTAUTH_URL : undefined);
    if (!subject || /[\r\n]/.test(subject)) throw new Error("Indica --subject con tu URL HTTPS pública o mailto:correo-de-contacto.");
    let contact;
    try { contact = new URL(subject); } catch { throw new Error("El contacto VAPID debe ser una URL HTTPS pública o mailto:correo-de-contacto."); }
    if (!["https:", "mailto:"].includes(contact.protocol) || (contact.protocol === "https:" && ["localhost", "127.0.0.1", "[::1]"].includes(contact.hostname))) throw new Error("El contacto VAPID debe ser una URL HTTPS pública o mailto:correo-de-contacto.");
    const keys = hasPublic ? { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY } : webpush.generateVAPIDKeys();
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(keys.publicKey) || !/^[A-Za-z0-9_-]+$/.test(keys.privateKey)) throw new Error();
      const ecdh = createECDH("prime256v1");
      ecdh.setPrivateKey(Buffer.from(keys.privateKey, "base64url"));
      if (ecdh.getPublicKey().toString("base64url") !== keys.publicKey) throw new Error();
      webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
    } catch { throw new Error("Las claves o el contacto VAPID no son válidos. No se ha modificado el archivo."); }
    const values = { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: subject };
    const newline = original.includes("\r\n") ? "\r\n" : "\n";
    let updated = original;
    for (const [key, value] of Object.entries(values)) {
      const line = key + "=" + JSON.stringify(value);
      const pattern = new RegExp("^(?:export[ \t]+)?" + key + "[ \t]*=[^\r\n]*", "gm");
      if (pattern.test(updated)) updated = updated.replace(pattern, () => line);
      else updated += (updated.endsWith("\n") ? "" : newline) + line + newline;
    }
    if (updated !== original) {
      temporary = envPath + ".push-setup." + randomUUID();
      writeFileSync(temporary, updated, { flag: "wx", mode: 0o600 });
      renameSync(temporary, envPath); temporary = undefined;
    }
    console.log(hasPublic ? "Configuración Web Push validada; se conservan las claves existentes." : "Claves Web Push guardadas en .env; no se muestran ni se publican.");
    console.log("Reinicia web y worker para cargar la configuración. Después activa tu dispositivo en Ajustes.");
  } finally {
    if (temporary) unlinkSync(temporary);
    closeSync(lock); unlinkSync(lockPath);
  }
}
try { setupPush(); }
catch (error) {
  const known = error?.code;
  console.error(known === "EEXIST" ? "Ya hay una configuración de Web Push en curso." : known === "ENOENT" ? "No existe el archivo .env indicado." : error instanceof Error ? error.message : "No se pudo configurar Web Push.");
  process.exitCode = 1;
}
