import { getCurrentUser } from "@/lib/dal";
import { recordActivity } from "@/lib/activity";
import { isAllowedOrigin } from "@/lib/security";
import { allowAttempt } from "@/lib/access";
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, process.env.NEXTAUTH_URL ?? request.url)) return Response.json({ error: "Origen inválido." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sesión requerida." }, { status: 401 });
  try {
    if (!await allowAttempt(`activity:${user.id}`, 60)) return Response.json({ error: "Espera antes de enviar más actividad." }, { status: 429, headers: { "Retry-After": "900" } });
    await recordActivity(user.id); return new Response(null, { status: 204 });
  }
  catch { return Response.json({ error: "No se pudo registrar la actividad." }, { status: 503 }); }
}
