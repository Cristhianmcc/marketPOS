import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ✅ Stitch Design System Colors
        primary: "#2bee79",
        "primary-hover": "#25d068",
        "primary-dark": "#25c765",
        "background-light": "#f6f8f7",
        "background-dark": "#111827",  // gray-900 - oscuro real
        "surface-light": "#ffffff",
        "surface-dark": "#1f2937",     // gray-800 - oscuro real
        "text-main": "#0d1b13",
        "text-light": "#f8fcfa",
        "text-secondary": "#4c9a6b",
        "border-light": "#e7f3ec",
        "border-dark": "#374151",      // gray-700 - bordes oscuros
        "border-subtle": "#cfe7d9",
        // Legacy colors for backward compatibility
        brand: {
          blue: '#1F2A37',
          green: '#16A34A',
          gray: {
            light: '#F3F4F6',
            medium: '#6B7280',
          },
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-inter)', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
        full: "9999px",
      },
      boxShadow: {
        'soft': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'medium': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        'strong': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

