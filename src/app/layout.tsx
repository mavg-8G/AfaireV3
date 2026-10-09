import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { ThemeProvider, THEME_COLORS, type Theme } from "@/components/ThemeProvider";
import { PwaProvider } from "@/components/PwaProvider";
import { LocaleProvider } from "@/components/LocaleProvider";
import { getRequestPreferences } from "@/lib/request-preferences";
import "@fontsource-variable/figtree/wght.css";
import "@fontsource-variable/bricolage-grotesque/index.css";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Afaire — tu día, en orden", template: "%s · Afaire" },
  description: "Tu agenda personal con citas, hábitos y autoagendado.",
  applicationName: "Afaire", manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Afaire", statusBarStyle: "default" },
  formatDetection: { telephone: false, email: false, address: false },
  icons: { icon: [{ url: "/favicon.ico", sizes: "32x32" }, { url: "/pwa/icon.svg", type: "image/svg+xml" }, { url: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/pwa/apple-touch-icon.png" },
  other: { "mobile-web-app-capable": "yes" },
  robots: { index: false, follow: false },
};
async function themePreference(): Promise<Theme> {
  const preference = (await cookies()).get("afaire-theme")?.value;
  return preference === "dark" || preference === "light" ? preference : "system";
}
export async function generateViewport(): Promise<Viewport> {
  const theme = await themePreference();
  return {
    width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content",
    colorScheme: theme === "system" ? "light dark" : theme,
    themeColor: theme === "system"
      ? [{ media: "(prefers-color-scheme: light)", color: THEME_COLORS.light }, { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark }]
      : THEME_COLORS[theme],
  };
}
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection(); // Every HTML document receives its own CSP nonce.
  const preferences = await getRequestPreferences();
  const theme = await themePreference();
  return <html lang={preferences.locale} data-theme={theme} className="h-full antialiased"><body className="flex min-h-full flex-col text-ink"><LocaleProvider preferences={preferences}><ThemeProvider initialTheme={theme}><PwaProvider>{children}</PwaProvider></ThemeProvider></LocaleProvider></body></html>;
}
