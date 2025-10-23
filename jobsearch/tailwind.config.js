module.exports = {
  theme: {
    extend: {
      fontFamily: {
        outfit: ["var(--font-outfit)", "sans-serif"],
      },
    },
  },
  plugins: [
    require('@tailwindcss/line-clamp'), // 👈 זה התוסף של שלוש הנקודות
  ],
};