import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { ThemeProvider, type Theme } from "@/components/ThemeProvider";
import { PwaProvider } from "@/components/PwaProvider";
import { LocaleProvider } from "@/components/LocaleProvider";
import { getRequestPreferences } from "@/lib/request-preferences";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Afaire — tu día, en orden", template: "%s · Afaire" },
  description: "Tu agenda personal con citas, hábitos y autoagendado.",
  applicationName: "Afaire", manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Afaire", statusBarStyle: "default" },
  icons: { icon: "/pwa/icon-192.png", apple: "/pwa/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#3f6b58", width: "device-width", initialScale: 1 };
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection(); // Every HTML document receives its own CSP nonce.
  const preferences = await getRequestPreferences();
  const preference = (await cookies()).get("afaire-theme")?.value;
  const theme: Theme = preference === "dark" || preference === "light" ? preference : "system";
  return <html lang={preferences.locale} data-theme={theme} className="h-full antialiased"><body className="flex min-h-full flex-col text-ink"><LocaleProvider preferences={preferences}><ThemeProvider initialTheme={theme}><PwaProvider>{children}</PwaProvider></ThemeProvider></LocaleProvider></body></html>;
}
