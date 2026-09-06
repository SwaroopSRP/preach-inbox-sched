/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#E8F5E9',
          100: '#C8E6C9',
          200: '#A5D6A7',
          500: '#00A854',
          600: '#009349',
          700: '#007E3E',
        },
        surface: {
          light: '#F8FAFC',
          input: '#F4F6F5',
          pill: '#F0F4F2',
          activePill: '#E6F4EA',
          card: '#FFFFFF',
          dark: '#0B0F19',
          darkCard: '#131B2E',
          darkInput: '#1E293B',
          darkBorder: '#334155',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
