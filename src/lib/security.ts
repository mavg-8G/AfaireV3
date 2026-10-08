export const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];
export const PRIVATE_CACHE = "private, no-store, max-age=0, must-revalidate";
export const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

export function isAllowedOrigin(origin: string | null, configuredUrl: string) {
  if (!origin || origin === "null") return false;
  const configured = new URL(configuredUrl);
  if (origin === configured.origin) return true;
  if (!LOOPBACK_HOSTS.includes(configured.hostname)) return false;
  return LOOPBACK_HOSTS.some(host => origin === `${configured.protocol}//${host}${configured.port ? `:${configured.port}` : ""}`);
}

export function contentSecurityPolicy(nonce: string, development: boolean, https: boolean) {
  if (!/^[A-Za-z0-9+/=]+$/.test(nonce)) throw new Error("Nonce inválido.");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'${development ? " 'unsafe-inline'" : ""}`,
    "style-src-attr 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${development ? " ws: wss:" : ""}`,
    "worker-src 'self'", "manifest-src 'self'",
    "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function validateRuntimeEnvironment(env: Record<string, string | undefined>) {
  const insecure = (value: string | undefined) => !value || /CHANGE_|YOUR_SECRET|build-only/i.test(value);
  if (insecure(env.AUTH_SECRET) || env.AUTH_SECRET!.length < 32) throw new Error("AUTH_SECRET debe ser aleatorio y tener al menos 32 caracteres.");
  let origin: URL;
  try { origin = new URL(env.NEXTAUTH_URL ?? ""); } catch { throw new Error("Define NEXTAUTH_URL con la URL pública de Afaire."); }
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") throw new Error("NEXTAUTH_URL debe contener únicamente el origen HTTP/HTTPS de Afaire.");
  if (env.NODE_ENV === "production" && origin.protocol !== "https:" && !LOOPBACK_HOSTS.includes(origin.hostname)) throw new Error("Afaire requiere HTTPS en producción; HTTP solo se admite en loopback local.");
  const mode = env.REGISTRATION_MODE ?? "invite";
  if (!["invite", "open"].includes(mode)) throw new Error("REGISTRATION_MODE debe ser invite u open.");
  if (mode === "invite" && (insecure(env.REGISTRATION_CODE) || env.REGISTRATION_CODE!.length < 16)) throw new Error("Define un REGISTRATION_CODE aleatorio de al menos 16 caracteres o elige explícitamente registro abierto.");
  let database: URL;
  try { database = new URL(env.DATABASE_URL ?? ""); } catch { throw new Error("Define DATABASE_URL para PostgreSQL."); }
  if (!["postgresql:", "postgres:"].includes(database.protocol) || !database.hostname || !database.username || database.pathname.length < 2 || insecure(decodeURIComponent(database.password))) throw new Error("DATABASE_URL debe definir una base PostgreSQL y una contraseña real, sin valores de ejemplo.");
  if (env.TRUST_PROXY && !["true", "false"].includes(env.TRUST_PROXY)) throw new Error("TRUST_PROXY debe ser true o false.");
}
