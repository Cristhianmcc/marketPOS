import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Ignorar ESLint durante builds de producción
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Ya validamos tipos localmente
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
