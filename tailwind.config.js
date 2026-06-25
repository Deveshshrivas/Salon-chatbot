/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Salon rose — refined, warm
        rose: {
          50: '#fdf2f5', 100: '#fce7ee', 200: '#fbd0de', 300: '#f7a9c1',
          400: '#f17a9e', 500: '#e6517d', 600: '#cf3a64', 700: '#ad2b50',
          800: '#8d2643', 900: '#74233b',
        },
        ink: {
          50: '#f6f5f4', 100: '#e7e5e2', 200: '#cbc6c1', 300: '#a39a92',
          400: '#7d7066', 500: '#5f534a', 600: '#4a3f37', 700: '#3a312c',
          800: '#272220', 900: '#171413',
        },
        cream: { bg: '#faf7f4', card: '#ffffff' },
      }
    }
  },
  plugins: [],
}
