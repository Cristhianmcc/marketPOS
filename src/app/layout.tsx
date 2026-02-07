import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';
import { ThemeProvider } from '@/components/theme/ThemeProvider';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
});

// ✅ MÓDULO S6: Viewport con theme-color para PWA
export const viewport: Viewport = {
  themeColor: '#16A34A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: 'Monterrial',
  description: 'Sistema de inventarios y ventas para bodegas',
  // ✅ MÓDULO S6: PWA manifest
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Monterrial',
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        {/* ✅ MÓDULO S6: Apple touch icon */}
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          <ServiceWorkerRegistration />
          <OfflineBanner />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
