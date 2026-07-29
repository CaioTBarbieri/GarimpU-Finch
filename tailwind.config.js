module.exports = {
  content: [
    "./public/index.html",
    "./public/js/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        mine: {
          950: "#141009",
          900: "#1d160f",
          850: "#241b12",
          700: "#3a2d1e",
        },
        nugget: {
          DEFAULT: "#c99b3f",
          bright: "#e3b768",
        },
        aqua: "#3fb6a8",
        olive: "#8bad63",
        terracotta: "#c1543c",
        parchment: "#f4ecdd",
        dust: "#a89a86",
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "sans-serif"],
        serif: ["Source Serif 4", "Georgia", "serif"],
        mono: ["JetBrains Mono", "Cascadia Code", "monospace"],
      },
    },
  },
  plugins: [],
};
