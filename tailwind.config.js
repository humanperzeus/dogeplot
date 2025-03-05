/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    screens: {
      'xs': '475px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1400px',
    },
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      lineClamp: {
        2: '2',
      },
      colors: {
        border: "#27272a",
        input: "#27272a",
        ring: "#6ee7b7",
        background: "#000000",
        foreground: "#ffffff",
        primary: {
          light: "#64ffda",
          DEFAULT: "#10b981",
          dark: "#047857",
        },
        accent: {
          light: "#bd34fe",
          DEFAULT: "#9333ea",
          dark: "#7e22ce",
        },
        zinc: {
          200: "#e4e4e7",
          300: "#d4d4d8",
          400: "#a1a1aa",
          500: "#71717a",
          600: "#52525b",
          700: "#3f3f46",
          800: "#27272a",
          900: "#18181b",
        },
        card: {
          DEFAULT: "#18181b",
          foreground: "#ffffff",
        },
      },
      animation: {
        float: 'float 3s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      backdropBlur: {
        md: '12px',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    function({ addUtilities }) {
      const newUtilities = {
        '.glass-panel': {
          'background': 'rgba(24, 24, 27, 0.8)',
          'backdrop-filter': 'blur(12px)',
          'border': '1px solid rgba(63, 63, 70, 0.5)',
          'border-radius': '0.75rem',
        },
        '.gradient-text': {
          'background': 'linear-gradient(to right, #6ee7b7, #6366f1)',
          '-webkit-background-clip': 'text',
          '-webkit-text-fill-color': 'transparent',
        },
      }
      addUtilities(newUtilities)
    },
  ],
}