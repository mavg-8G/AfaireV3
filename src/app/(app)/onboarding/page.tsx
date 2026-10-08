import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { SettingsForms } from "@/components/SettingsForms";
export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.onboardingCompleted) redirect("/");
  return <SettingsForms profile={user} onboarding />;
}
