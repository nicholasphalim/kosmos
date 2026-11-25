import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build E2E mode live memakai folder terpisah agar tidak menimpa build mode mock.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  experimental: {
    // Data aplikasi ini diambil di browser (TanStack Query) dan area penghuni/pemilik
    // baru bisa dirender setelah sesi di localStorage dibaca. Validasi instant navigation
    // otomatis untuk setiap halaman tidak relevan, jadi hanya segmen yang opt-in
    // (export const instant) yang divalidasi.
    instantInsights: {
      validationLevel: "manual-warning",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
