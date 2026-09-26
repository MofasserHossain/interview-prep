import type { MetadataRoute } from "next";
import { brand, siteDescription, siteName } from "@/lib/site";

/** Served at /manifest.webmanifest. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteName,
    short_name: "Docs Library",
    description: siteDescription,
    start_url: "/",
    display: "standalone",
    background_color: brand.background,
    theme_color: brand.background,
    categories: ["education", "developer", "reference"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
