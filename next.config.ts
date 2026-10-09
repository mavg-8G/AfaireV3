import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/security";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": [
      "node_modules/@prisma/client/runtime/{client.js,query_compiler_fast_bg.postgresql.*}",
      // The bundled worker and admin health check load the adapter through CommonJS.
      "node_modules/@prisma/{adapter-pg,driver-adapter-utils,debug}/**/*",
      "node_modules/{pg,pg-*,pgpass,postgres-*,split2,xtend}/**/*",
    ],
  },
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/sw.js", headers: [
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "Cache-Control", value: "no-store, max-age=0" },
        { key: "Service-Worker-Allowed", value: "/" },
        { key: "Content-Security-Policy", value: "default-src 'none'; script-src 'self'; connect-src 'self'; worker-src 'self'" },
      ] },
      { source: "/offline.html", headers: [
        { key: "Content-Security-Policy", value: "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" },
      ] },
      { source: "/manifest.webmanifest", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
