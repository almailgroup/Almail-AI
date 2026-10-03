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

  /**
   * E2E_STUB swaps Firebase for an in-memory stand-in so the whole UI can be
   * driven in a sandbox with no network. It is a build flag, never a runtime
   * one: a production build has no reference to src/testing at all.
   */
  webpack: (config) => {
    if (process.env.E2E_STUB === "1") {
      const path = require("node:path");
      const stub = (f: string) => path.resolve(process.cwd(), "src/testing", f);
      config.resolve.alias = {
        ...config.resolve.alias,
        "firebase/app": stub("firebase-app.ts"),
        "firebase/auth": stub("firebase-auth.ts"),
        "firebase/firestore": stub("firebase-firestore.ts"),
        "firebase/storage": stub("firebase-storage.ts"),
      };
    }
    return config;
  },
};

export default nextConfig;
