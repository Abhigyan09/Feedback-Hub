/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        poppins: ['Poppins', 'Plus Jakarta Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      borderRadius: {
        none: '0',
        xs: '2px',
        sm: '4px',
        DEFAULT: '6px',
        md: '6px',
        lg: '8px',
        xl: '10px',
        '2xl': '12px',
        full: '9999px',
        subtle: '6px',
        card: '6px',
        panel: '6px',
        badge: '4px',
      },
      fontWeight: {
        thin: '100',
        extralight: '200',
        light: '300',
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
        extrabold: '800',
        black: '900',
      },
      colors: {
        navy: {
          950: '#070e1c',
          900: '#0b162c',
          800: '#0f2347',
          700: '#143163',
          600: '#1a4185',
          DEFAULT: '#0f2347'
        },
        purple: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7e22ce',
          800: '#6b21a8',
          900: '#581c87',
        }
      }
    },
  },
  plugins: [],
}
