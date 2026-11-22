import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: { colors: { ink: "#080b12", panel: "#101722", accent: "#8b7cff" } } },
  plugins: []
};
export default config;
