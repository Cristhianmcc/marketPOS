import type { NextConfig } from "next";

// Solo usar output standalone para builds de desktop
const isDesktopBuild = process.env.DESKTOP_BUILD === '1';

const nextConfig: NextConfig = {
  // Generar build standalone SOLO para Electron desktop
  ...(isDesktopBuild && { output: 'standalone' }),
  eslint: {
    // Ignorar ESLint durante builds de producción
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Ya validamos tipos localmente
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
    ],
  },
  // Excluir carpetas del análisis
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/pgsql/**', '**/dist-electron/**', '**/node_modules/**'],
    };
    return config;
  },
};

export default nextConfig;
