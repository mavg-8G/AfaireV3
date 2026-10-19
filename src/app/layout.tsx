import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/components/ThemeProvider";
import { THEME_COLORS, type Theme } from "@/lib/theme";
import { PwaProvider } from "@/components/PwaProvider";
import { LocaleProvider } from "@/components/LocaleProvider";
import { getRequestPreferences } from "@/lib/request-preferences";
import "@fontsource-variable/figtree/wght.css";
import "@fontsource-variable/bricolage-grotesque/index.css";
import "./globals.css";
const baseMetadata: Metadata = {
  title: { default: "Afaire — tu día, en orden", template: "%s · Afaire" },
  description: "Tu agenda personal con citas, hábitos y autoagendado.",
  applicationName: "Afaire", manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Afaire", statusBarStyle: "default" },
  formatDetection: { telephone: false, email: false, address: false },
  other: { "mobile-web-app-capable": "yes" },
  robots: { index: false, follow: false },
};
async function themePreference(): Promise<Theme> {
  const preference = (await cookies()).get("afaire-theme")?.value;
  return preference === "dark" || preference === "light" ? preference : "system";
}
export async function generateMetadata(): Promise<Metadata> {
  const theme = await themePreference();
  const variants = theme === "system" ? ["light", "dark"] as const : [theme];
  return {
    ...baseMetadata,
    icons: {
      icon: variants.flatMap(value => {
        const media = theme === "system" ? { media: `(prefers-color-scheme: ${value})` } : {};
        return [
          { url: `/pwa/impulso-${value}.ico`, type: "image/x-icon", sizes: "16x16 32x32 48x48", ...media },
          { url: `/pwa/impulso-${value}.svg`, type: "image/svg+xml", sizes: "any", ...media },
          // Raster fallback for browsers that retain an older ICO or ignore SVG candidates.
          { url: `/pwa/impulso-${value}-32.png`, type: "image/png", sizes: "32x32", ...media },
        ];
      }),
      apple: variants.map(value => ({
        url: `/pwa/apple-touch-icon${value === "dark" ? "-dark" : ""}.png?v=3`, sizes: "180x180", type: "image/png",
        ...(theme === "system" ? { media: `(prefers-color-scheme: ${value})` } : {}),
      })),
    },
  };
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
