import { requireUser } from "@/lib/dal";
import { SettingsForms } from "@/components/SettingsForms";
export default async function SettingsPage() { return <SettingsForms profile={await requireUser()} />; }
