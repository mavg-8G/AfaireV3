import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { PwaProvider } from "@/components/PwaProvider";
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
  return <html lang="es" className="h-full antialiased"><body className="flex min-h-full flex-col text-ink"><PwaProvider>{children}</PwaProvider></body></html>;
}
