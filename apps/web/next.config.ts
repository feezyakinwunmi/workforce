import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship source maps for browser code so error traces show real file names and lines
  // (added 26 Nov 2026 to track down a Bizz Padi chat crash; the code is open-source-safe:
  // no secrets live in browser bundles).
  productionBrowserSourceMaps: true,
};

export default nextConfig;
