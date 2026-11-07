import type { MetadataRoute } from "next";

/** Manifest PWA: permette di aggiungere il gestionale alla schermata Home (iPhone, Android, desktop). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Gestionale MM",
    short_name: "Gestionale",
    description: "Clienti, servizi, rinnovi e pagamenti",
    lang: "it",
    dir: "ltr",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Rinnovi", url: "/rinnovi", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Entrate", url: "/entrate", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Notifiche", url: "/notifiche", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
