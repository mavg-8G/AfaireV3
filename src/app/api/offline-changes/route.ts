import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/dal";
import { withUserLock, DomainError } from "@/lib/transaction";
import { applyOfflineChange, OfflineChangeSchema, OfflineSessionError } from "@/lib/offline-mutations";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sesión requerida." }, { status: 401, headers });
  let input;
  try {
    const text = await request.text();
    if (text.length > 16_384) return Response.json({ error: "Cambio demasiado grande." }, { status: 413, headers });
    input = OfflineChangeSchema.safeParse(JSON.parse(text));
  } catch { return Response.json({ error: "Cambio inválido." }, { status: 400, headers }); }
  if (!input.success) return Response.json({ error: "Revisa el cambio guardado." }, { status: 400, headers });
  try {
    const result = await withUserLock(user.id, tx => applyOfflineChange(tx, user, input.data));
    for (const path of ["/", "/week", "/inbox", "/review", "/habits"]) revalidatePath(path);
    return Response.json({ ok: true, ...result }, { headers });
  } catch (error) {
    if (error instanceof OfflineSessionError) return Response.json({ error: error.message }, { status: 403, headers });
    if (error instanceof DomainError) return Response.json({ error: error.message, conflict: true }, { status: 409, headers });
    if (error && typeof error === "object" && "code" in error && ["P2002", "P2004"].includes(String(error.code))) return Response.json({ error: "El cambio entra en conflicto con la agenda actual.", conflict: true }, { status: 409, headers });
    console.error("Offline sync failed", error instanceof Error ? error.name : "Error");
    return Response.json({ error: "No se pudo sincronizar. Se reintentará." }, { status: 503, headers });
  }
}
