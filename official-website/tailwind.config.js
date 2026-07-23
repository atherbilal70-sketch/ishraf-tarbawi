/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./*.html', './assets/js/*.js'],
  theme: {
    extend: {
      fontFamily: { sans: ['Tajawal', 'sans-serif'] },
      colors: {
        primary: { DEFAULT: '#0F2E52', dark: '#0A2140', light: '#1D4E89' },
        gold: { DEFAULT: '#C9A227', light: '#E3C766', pale: '#F7EFD8' },
        surface: '#F5F6F8'
      }
    }
  },
  plugins: []
};
