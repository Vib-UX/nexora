import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        nexora: {
          bg: "#08090d",
          card: "#11131a",
          border: "#252836",
          accent: "#7c5cff",
          warn: "#ffb547",
          danger: "#ff5470",
          ok: "#5eead4",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
