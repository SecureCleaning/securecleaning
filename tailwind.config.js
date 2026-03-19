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
          DEFAULT: '#1a2744',
          50: '#eef1f8',
          100: '#d5dced',
          200: '#aab9db',
          300: '#7f96c9',
          400: '#5473b7',
          500: '#3a59a3',
          600: '#2e4785',
          700: '#253966',
          800: '#1a2744',
          900: '#0f1728',
        },
        brand: {
          green: '#22c55e',
          navy: '#1a2744',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
