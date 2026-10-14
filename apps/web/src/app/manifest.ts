import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/config";

/** Lets people add the dashboard to their phone's home screen; it opens on the clock-in screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: "Workbase",
    description: "Clock in, see your hours, chat and request leave.",
    start_url: "/dashboard/clock",
    scope: "/",
    display: "standalone",
    background_color: "#f7f6fb",
    theme_color: "#6a4cf5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
