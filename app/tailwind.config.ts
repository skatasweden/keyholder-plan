import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f0e9df',
        'bg-alt': '#e6ddd2',
        accent: '#f04e3e',
        'accent-dark': '#c93526',
        'accent-light': '#fce0dd',
        brown: '#1a0f09',
        'brown-mid': '#362318',
        'text-body': '#62493e',
        'text-muted': '#7a6358',
        border: '#d9cec4',
        pass: '#2d7a4f',
        fail: '#f04e3e',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '18px',
        stat: '20px',
        badge: '6px',
        pill: '9999px',
      },
      boxShadow: {
        'card-hover': '0 16px 40px rgba(30, 19, 12, 0.08)',
      },
    },
  },
  plugins: [],
}

export default config
