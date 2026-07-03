/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#DED6C9',
        ink: '#211913',
        accent: '#E4571B',
        muted: '#6E655A',
        mutedOnDark: '#A99B87',
        subtle: '#A79C8D',
        borderMuted: '#E6DCCB',
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
