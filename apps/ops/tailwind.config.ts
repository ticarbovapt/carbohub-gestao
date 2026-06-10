import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        inter: ['Inter', 'system-ui', 'sans-serif'],
        plex: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Carbo brand colors
        carbo: {
          green: "hsl(var(--carbo-green))",
          blue: "hsl(var(--carbo-blue))",
        },
        // Board layer colors
        board: {
          bg: "hsl(var(--board-bg))",
          surface: "hsl(var(--board-surface))",
          navy: "hsl(var(--board-navy))",
          blue: "hsl(var(--board-blue))",
          text: "hsl(var(--board-text))",
          muted: "hsl(var(--board-muted))",
        },
        // Ops layer colors
        ops: {
          bg: "hsl(var(--ops-bg))",
          surface: "hsl(var(--ops-surface))",
          yellow: "hsl(var(--ops-yellow))",
          green: "hsl(var(--ops-green))",
          coral: "hsl(var(--ops-coral))",
          text: "hsl(var(--ops-text))",
          muted: "hsl(var(--ops-muted))",
        },
        // Area accent tokens — acento por área (pill, CTA, highlight, badge)
        area: {
          controle: "hsl(var(--area-controle))",
          "controle-dark": "hsl(var(--area-controle-dark))",
          "controle-soft": "hsl(var(--area-controle-soft))",
          "controle-foreground": "hsl(var(--area-controle-foreground))",
          licensee: "hsl(var(--area-licensee))",
          "licensee-dark": "hsl(var(--area-licensee-dark))",
          "licensee-soft": "hsl(var(--area-licensee-soft))",
          "licensee-foreground": "hsl(var(--area-licensee-foreground))",
          products: "hsl(var(--area-products))",
          "products-dark": "hsl(var(--area-products-dark))",
          "products-soft": "hsl(var(--area-products-soft))",
          "products-foreground": "hsl(var(--area-products-foreground))",
        },
        // Cockpit Theme — MasterAdmin exclusive (header, pill restrito, audit ribbon)
        cockpit: {
          "header-bg": "hsl(var(--cockpit-header-bg))",
          "header-border": "hsl(var(--cockpit-header-border))",
          "header-fg": "hsl(var(--cockpit-header-fg))",
          "header-muted": "hsl(var(--cockpit-header-muted))",
          "accent": "hsl(var(--cockpit-accent))",
          "accent-soft": "hsl(var(--cockpit-accent-soft))",
          "restricted-bg": "hsl(var(--cockpit-restricted-bg))",
          "restricted-fg": "hsl(var(--cockpit-restricted-fg))",
          "restricted-border": "hsl(var(--cockpit-restricted-border))",
          "audit-bg": "hsl(var(--cockpit-audit-bg))",
          "audit-fg": "hsl(var(--cockpit-audit-fg))",
          "card-border": "hsl(var(--cockpit-accent) / 0.18)",
        },
        // Department colors
        dept: {
          logistica: "hsl(var(--dept-logistica))",
          manutencao: "hsl(var(--dept-manutencao))",
          qualidade: "hsl(var(--dept-qualidade))",
          seguranca: "hsl(var(--dept-seguranca))",
          "logistica-accent": "hsl(var(--dept-logistica-accent))",
          "manutencao-accent": "hsl(var(--dept-manutencao-accent))",
          "qualidade-accent": "hsl(var(--dept-qualidade-accent))",
          "seguranca-accent": "hsl(var(--dept-seguranca-accent))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
        "3xl": "calc(var(--radius) + 16px)",
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "wiggle": {
          "0%, 100%": { transform: "rotate(-2deg)" },
          "50%": { transform: "rotate(2deg)" },
        },
        "glow": {
          "0%, 100%": { boxShadow: "0 0 0 2px hsl(var(--carbo-green) / 0.3)" },
          "50%": { boxShadow: "0 0 0 4px hsl(var(--carbo-green) / 0.15)" },
        },
        // Premium polish keyframes
        "ripple": {
          "0%": { transform: "scale(0)", opacity: "0.4" },
          "100%": { transform: "scale(4)", opacity: "0" },
        },
        "progress-bar": {
          "0%": { width: "0%", opacity: "1" },
          "80%": { width: "90%", opacity: "1" },
          "100%": { width: "100%", opacity: "0" },
        },
        "count-up": {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "slide-in-from-right-subtle": {
          "0%": { transform: "translateX(16px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "border-glow": {
          "0%, 100%": { boxShadow: "0 0 0 1px hsl(var(--carbo-green) / 0.15), 0 0 8px hsl(var(--carbo-green) / 0.05)" },
          "50%": { boxShadow: "0 0 0 1px hsl(var(--carbo-green) / 0.35), 0 0 16px hsl(var(--carbo-green) / 0.12)" },
        },
        "toast-slide-in": {
          "0%": { transform: "translateX(100%) scale(0.96)", opacity: "0" },
          "100%": { transform: "translateX(0) scale(1)", opacity: "1" },
        },
        "fade-up-subtle": {
          "0%": { transform: "translateY(6px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "kpi-pulse": {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.02)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "wiggle": "wiggle 0.3s ease-in-out",
        "glow": "glow 2s ease-in-out infinite",
        // Premium polish animations
        "ripple": "ripple 0.6s ease-out forwards",
        "progress-bar": "progress-bar 1.8s cubic-bezier(0.4, 0, 0.2, 1) forwards",
        "count-up": "count-up 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) both",
        "slide-in-right-subtle": "slide-in-from-right-subtle 0.25s ease-out",
        "border-glow": "border-glow 2.5s ease-in-out infinite",
        "toast-slide-in": "toast-slide-in 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        "fade-up-subtle": "fade-up-subtle 0.3s ease-out both",
        "kpi-pulse": "kpi-pulse 0.6s ease-in-out",
      },
      boxShadow: {
        'board': '0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.05)',
        'board-lg': '0 4px 16px -4px rgb(0 0 0 / 0.08)',
        'board-xl': '0 8px 32px -8px rgb(0 0 0 / 0.12)',
        'ops': '0 4px 20px -4px rgb(59 199 112 / 0.3)',
        'ops-lg': '0 8px 32px -8px rgb(59 199 112 / 0.4)',
        'carbo': '0 4px 20px -4px rgb(59 199 112 / 0.25), 0 4px 20px -4px rgb(79 164 232 / 0.25)',
        'carbo-lg': '0 8px 32px -8px rgb(59 199 112 / 0.3), 0 8px 32px -8px rgb(79 164 232 / 0.3)',
        'card-hover': '0 8px 24px -6px rgb(0 0 0 / 0.12), 0 2px 8px -2px rgb(0 0 0 / 0.06)',
        'kpi': '0 2px 8px -2px rgb(0 0 0 / 0.06), inset 0 1px 0 rgb(255 255 255 / 0.06)',
        'toast': '0 8px 32px -8px rgb(0 0 0 / 0.18), 0 2px 8px -2px rgb(0 0 0 / 0.08)',
        'modal': '0 24px 64px -16px rgb(0 0 0 / 0.2)',
      },
      transitionTimingFunction: {
        'enterprise': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        '150': '150ms',
        '250': '250ms',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
