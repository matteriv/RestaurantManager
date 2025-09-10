import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        success: "var(--success)",
        warning: "var(--warning)",
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Roboto", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "Roboto Mono", "monospace"],
      },
      fontSize: {
        'kds': 'clamp(1.125rem, 2vw, 1.5rem)',
        'kds-large': 'clamp(1.5rem, 3vw, 2rem)',
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-slow": "pulse-slow 2s ease-in-out infinite",
        "bounce-subtle": "bounce-subtle 1s ease-in-out infinite",
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "pulse-slow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "bounce-subtle": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-2px)" },
        },
        "fadeIn": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slideUp": {
          from: { 
            opacity: "0",
            transform: "translateY(10px)",
          },
          to: { 
            opacity: "1",
            transform: "translateY(0)",
          },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      gridTemplateColumns: {
        'auto-fit': 'repeat(auto-fit, minmax(200px, 1fr))',
        'auto-fill': 'repeat(auto-fill, minmax(200px, 1fr))',
      },
      minHeight: {
        'touch': '44px',
      },
      minWidth: {
        'touch': '44px',
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"), 
    require("@tailwindcss/typography"),
    // Custom plugin for restaurant-specific utilities
    function({ addUtilities }: { addUtilities: any }) {
      const newUtilities = {
        '.glass': {
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
        },
        '.grid-auto-fit': {
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        },
        '.grid-auto-fill': {
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        },
        '.touch-btn': {
          minHeight: '44px',
          minWidth: '44px',
        },
        '.status-new': {
          backgroundColor: 'hsl(210, 100%, 95%)',
          color: 'hsl(210, 100%, 35%)',
          borderColor: 'hsl(210, 100%, 85%)',
        },
        '.status-preparing': {
          backgroundColor: 'hsl(45, 100%, 95%)',
          color: 'hsl(45, 100%, 35%)',
          borderColor: 'hsl(45, 100%, 85%)',
        },
        '.status-ready': {
          backgroundColor: 'hsl(120, 100%, 95%)',
          color: 'hsl(120, 100%, 25%)',
          borderColor: 'hsl(120, 100%, 85%)',
        },
        '.status-served': {
          backgroundColor: 'hsl(0, 0%, 95%)',
          color: 'hsl(0, 0%, 35%)',
          borderColor: 'hsl(0, 0%, 85%)',
        },
        '.status-paid': {
          backgroundColor: 'hsl(270, 100%, 95%)',
          color: 'hsl(270, 100%, 35%)',
          borderColor: 'hsl(270, 100%, 85%)',
        },
      }
      addUtilities(newUtilities)
    }
  ],
} satisfies Config;
