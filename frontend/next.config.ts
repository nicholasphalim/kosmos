import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
