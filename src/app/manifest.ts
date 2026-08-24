import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Athlemetry",
    short_name: "Athlemetry",
    description: "Multi-sport video performance intelligence for athlete development.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f766e",
    orientation: "portrait-primary",
    categories: ["sports", "health", "productivity"],
  };
}
