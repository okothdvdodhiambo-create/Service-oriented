/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { teal: "#0F766E", ink: "#0B1F33" }, borderRadius: { card: "12px" } } },
  plugins: []
};
