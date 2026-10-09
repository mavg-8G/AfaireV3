import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "Afaire — tu día, en orden", short_name: "Afaire",
    description: "Organiza tus citas, hábitos y tareas con una agenda que aprende contigo.",
    lang: "es", dir: "ltr", start_url: "/", scope: "/",
    display: "standalone", display_override: ["standalone", "minimal-ui"],
    background_color: "#f2f4f1", theme_color: "#1f6f5c",
    categories: ["productivity", "lifestyle"], prefer_related_applications: false,
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Mi día", short_name: "Hoy", url: "/", description: "Abrir la agenda de hoy", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
      { name: "Semana", url: "/week", description: "Ver la semana completa", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
      { name: "Bandeja", url: "/inbox", description: "Capturar una tarea", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
      { name: "Hábitos", url: "/habits", description: "Revisar tus rutinas", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
