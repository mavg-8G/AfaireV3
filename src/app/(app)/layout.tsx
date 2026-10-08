import { requireUser } from "@/lib/dal";
import { AppNav } from "@/components/AppNav";
import { UsageTracker } from "@/components/UsageTracker";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <><UsageTracker enabled={user.adaptiveAvailability && user.onboardingCompleted} /><AppNav name={user.name} /><main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:py-10">{children}</main><footer className="mx-auto w-full max-w-6xl px-5 pb-6 text-xs text-muted">Afaire · un día a la vez</footer></>;
}
