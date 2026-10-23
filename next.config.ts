import type { NextConfig } from "next";

// Solo usar output standalone para builds de desktop
const isDesktopBuild = process.env.DESKTOP_BUILD === '1';

const nextConfig: NextConfig = {
  // Keep xmllint-wasm as a real Node package. It starts a worker and resolves
  // xmllint-node.js/xmllint.wasm relative to its own __dirname; bundling it
  // into a Next.js route would point that worker at the route directory.
  serverExternalPackages: ['xmllint-wasm'],
  // Generar build standalone SOLO para Electron desktop
  ...(isDesktopBuild && { output: 'standalone' }),
  // La Beta desktop expone el acceso visual al onboarding SUNAT. Las APIs
  // siguen aplicando autenticación, rol, tienda y ambiente en el servidor.
  ...(isDesktopBuild && {
    env: {
      NEXT_PUBLIC_ENABLE_SUNAT: 'true',
    },
  }),
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
