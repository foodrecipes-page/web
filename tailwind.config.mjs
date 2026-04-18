/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        cream: {
          50: "#FFF8EC",
          100: "#FFF1D6",
          200: "#FFE4AD",
        },
        brand: {
          50: "#FFF1EC",
          100: "#FFD9C9",
          200: "#FFB598",
          300: "#FF8F62",
          400: "#FF6B35",
          500: "#F04E15",
          600: "#D2360A",
          700: "#A82A08",
        },
        herb: {
          100: "#D6F5DD",
          300: "#7DD891",
          500: "#2EB653",
          600: "#1F8A3E",
          700: "#166B30",
        },
        sun: {
          100: "#FFF3C4",
          300: "#FFD666",
          500: "#FFB800",
          600: "#E59E00",
        },
        blueberry: {
          100: "#E0E9FF",
          200: "#C4D2F8",
          300: "#A6B7F0",
          400: "#7B8EE8",
          500: "#5C70D8",
          600: "#4759C6",
          700: "#3544A0",
        },
        ink: {
          600: "#3D2B1F",
          700: "#2B1D13",
        },
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["\"Plus Jakarta Sans\"", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "2xl": "1.25rem",
        "3xl": "1.75rem",
        "4xl": "2.25rem",
      },
      boxShadow: {
        clay:
          "0 10px 22px -10px rgba(120, 70, 40, 0.20), 0 4px 10px -4px rgba(120, 70, 40, 0.10), inset 0 -3px 0 0 rgba(120, 70, 40, 0.08)",
        "clay-lg":
          "0 24px 44px -16px rgba(120, 70, 40, 0.26), 0 8px 18px -8px rgba(120, 70, 40, 0.12), inset 0 -4px 0 0 rgba(120, 70, 40, 0.10)",
        "clay-pressed":
          "inset 0 4px 10px 0 rgba(120, 70, 40, 0.18), inset 0 -1px 0 0 rgba(255,255,255,0.5)",
        "clay-herb":
          "0 10px 22px -10px rgba(46, 182, 83, 0.30), inset 0 -3px 0 0 rgba(22, 107, 48, 0.20)",
        "clay-sun":
          "0 12px 26px -10px rgba(255, 184, 0, 0.40), inset 0 -3px 0 0 rgba(229, 158, 0, 0.25)",
        "clay-sm":
          "0 6px 14px -6px rgba(120, 70, 40, 0.16), inset 0 -2px 0 0 rgba(120, 70, 40, 0.06)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-2deg)" },
          "50%": { transform: "rotate(2deg)" },
        },
        "blob-morph": {
          "0%, 100%": { borderRadius: "42% 58% 62% 38% / 50% 42% 58% 50%" },
          "50%": { borderRadius: "58% 42% 38% 62% / 42% 58% 50% 50%" },
        },
      },
      animation: {
        float: "float 5s ease-in-out infinite",
        "float-slow": "float 7s ease-in-out infinite",
        wiggle: "wiggle 3s ease-in-out infinite",
        "blob-morph": "blob-morph 12s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
