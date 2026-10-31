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
        sans: ['Poppins', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        poppins: ['Poppins', 'sans-serif'],
        mono: ['Poppins', 'JetBrains Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        none: '0',
        xs: '4px',
        sm: '6px',
        DEFAULT: '8px',
        md: '8px',
        lg: '10px',
        xl: '12px',
        '2xl': '16px',
        '3xl': '20px',
        full: '9999px',
        subtle: '8px',
        card: '12px',
        panel: '12px',
        button: '8px',
        input: '8px',
        badge: '6px',
        modal: '12px',
      },
      fontWeight: {
        thin: '100',
        extralight: '200',
        light: '300',
        normal: '400',
        medium: '450',
        semibold: '500',
        bold: '500',
        extrabold: '500',
        black: '500',
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
