/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      borderRadius: {
        'none': '0px',
        'xs': '2px',
        'sm': '2px',
        'DEFAULT': '2px',
        'md': '3px',
        'lg': '4px',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      colors: {
        stripe: {
          bg: '#09090b',
          surface: '#121215',
          border: '#27272a',
          hover: '#1c1c21',
          accent: '#6366f1',
          text: '#fafafa',
          muted: '#a1a1aa'
        }
      }
    },
  },
  plugins: [],
}
