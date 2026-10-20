import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Schachcoach",
    short_name: "Schachcoach",
    description: "Dein Schachtraining und deine Partienanalyse – allein und im Verein.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#050505",
    icons: [
      {
        src: "/chess-logo-192.png?v=8",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/chess-logo-512.png?v=8",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/chess-logo-192-maskable.png?v=8",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/chess-logo-512-maskable.png?v=8",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
