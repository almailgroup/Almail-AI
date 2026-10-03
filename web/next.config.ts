import type { NextConfig } from "next";

/**
 * Static export.
 *
 * This app is served by GitHub Pages, which runs no server — so there are no
 * route handlers or edge functions to lean on. Everything happens in the
 * browser: Firebase talks to Firestore directly, and model traffic goes to
 * the existing Cloudflare Worker, which is what keeps the provider key off
 * the client. `output: "export"` makes that constraint explicit at build
 * time instead of failing at deploy time.
 */
const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
  // Pages serves the build from a subpath; set BASE_PATH at build time.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  trailingSlash: true,
};

export default nextConfig;
