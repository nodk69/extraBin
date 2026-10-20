/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: '#17201d',
        paper: '#f4f1e9',
        soft: '#e8e4da',
        coral: '#ff5c3d',
        acid: '#c6f05b',
        blue: '#5e7dff',
        muted: '#777a72',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'Courier New', 'monospace'],
      }
    },
  },
  plugins: [],
}
