/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0b4d5f',
          50: '#edf7f9',
          100: '#d6ebf0',
          200: '#add7e0',
          300: '#7ec0cd',
          400: '#4b9cad',
          500: '#2b7b91',
          600: '#16657b',
          700: '#0f5163',
          800: '#0b4d5f',
          900: '#083846',
        },
        brand: {
          teal: '#0b5f74',
          gold: '#c99b34',
          ink: '#083d4c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
