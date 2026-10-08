import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { contentSecurityPolicy, isAllowedOrigin, PRIVATE_CACHE, SECURITY_HEADERS } from "./lib/security";
export function proxy(request: NextRequest) {
  const configuredUrl = process.env.NEXTAUTH_URL ?? request.url;
  const nonce = randomBytes(16).toString("base64");
  const https = new URL(configuredUrl).protocol === "https:";
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development", https);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const decorate = (response: NextResponse) => {
    for (const header of SECURITY_HEADERS) response.headers.set(header.key, header.value);
    response.headers.set("Content-Security-Policy", csp);
    response.headers.set("Cache-Control", PRIVATE_CACHE);
    if (https) response.headers.set("Strict-Transport-Security", "max-age=31536000");
    return response;
  };
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      (request.headers.get("sec-fetch-site") === "cross-site" || !isAllowedOrigin(request.headers.get("origin"), configuredUrl))) {
    return decorate(NextResponse.json({ error: "Solicitud de otro origen rechazada." }, { status: 403 }));
  }
  const token = request.cookies.get("next-auth.session-token") ?? request.cookies.get("__Secure-next-auth.session-token");
  // Optimistic navigation only; the DAL validates the session and its version.
  const privatePage = /^\/(?:$|week(?:\/|$)|habits(?:\/|$)|inbox(?:\/|$)|settings(?:\/|$)|onboarding(?:\/|$))/.test(request.nextUrl.pathname);
  if (privatePage && !token) return decorate(NextResponse.redirect(new URL("/login", configuredUrl)));
  return decorate(NextResponse.next({ request: { headers: requestHeaders } }));
}
export const config = { matcher: ["/((?!_next/static|_next/image|pwa/|sw\\.js$|offline\\.(?:html|css)$|manifest\\.webmanifest$|favicon\\.ico$).*)"] };
