import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser } from "./dal";
import { parsePreferences, translator } from "./locale";
export async function getRequestPreferences() {
  const user = await getCurrentUser();
  if (user) return parsePreferences(user);
  const jar = await cookies();
  return parsePreferences({ locale: jar.get("afaire-locale")?.value ?? "es", hourFormat: jar.get("afaire-hour-format")?.value ?? "24", weekStartsOn: jar.get("afaire-week-start")?.value ?? 1 });
}
export async function requestTranslator() { return translator((await getRequestPreferences()).locale); }
