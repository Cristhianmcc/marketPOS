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
        // ✅ Paleta Monterrial (logo): verde bosque, crema y dorado.
        // primary cambia en modo oscuro vía variables CSS (globals.css).
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        "primary-hover": "rgb(var(--color-primary-hover) / <alpha-value>)",
        "primary-dark": "rgb(var(--color-primary-hover) / <alpha-value>)",
        "background-light": "#f6f5f1",
        "background-dark": "#0b1512",
        "surface-light": "#ffffff",
        "surface-dark": "#13211d",
        "text-main": "#0e2a24",
        "text-light": "#f3f1ec",
        "text-secondary": "#5b6f68",
        "border-light": "#e8e5dc",
        "border-dark": "#26372f",
        "border-subtle": "#d9d4c7",
        monterrial: {
          forest: "#0e2a24",
          "forest-light": "#163a32",
          sage: "#3c524c",
          cream: "#f3f1ec",
          gold: "#bfa463",
          "gold-light": "#d4bf8a",
        },
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

