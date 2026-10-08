import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "Afaire — tu día, en orden", short_name: "Afaire",
    description: "Organiza tus citas, hábitos y tareas con una agenda que aprende contigo.",
    lang: "es", start_url: "/", scope: "/", display: "standalone",
    background_color: "#f7f5ef", theme_color: "#3f6b58",
    categories: ["productivity", "lifestyle"], prefer_related_applications: false,
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Mi día", url: "/", description: "Abrir la agenda de hoy" },
      { name: "Bandeja", url: "/inbox", description: "Capturar una tarea" },
    ],
  };
}
