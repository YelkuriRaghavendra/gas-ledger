/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm-paper base (was a flat, muddy #DED6C9). Lighter so white
        // surfaces float against it and the whole app feels airier.
        cream: '#F4EFE6',
        paper: '#F4EFE6',
        surface: '#FFFFFF',
        ink: '#1F1813',
        inkSoft: '#2E2620',
        accent: '#E4571B',
        accentSoft: '#F26B2C',
        muted: '#6E655A',
        mutedOnDark: '#A99B87',
        subtle: '#A79C8D',
        borderMuted: '#E7DECF',
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Soft, layered elevation for white cards — separation without hard borders.
        card: '0 1px 2px rgba(31,24,19,0.04), 0 8px 22px -10px rgba(31,24,19,0.12)',
        float: '0 18px 40px -16px rgba(31,24,19,0.32)',
        glow: '0 14px 30px -10px rgba(228,87,27,0.55)',
      },
      borderRadius: {
        '4xl': '28px',
      },
    },
  },
  plugins: [],
}
