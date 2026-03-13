/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          50: '#f8f9fc',
          100: '#f0f2f7',
          200: '#e2e5ee',
          300: '#c8cdd9',
          400: '#9ba3b5',
          500: '#6b7489',
          600: '#4a5568',
          700: '#2d3748',
          800: '#1a202c',
          900: '#0f1117',
          950: '#080a0e',
        },
        blue: {
          team: '#1e40af',
          glow: '#3b82f6',
        },
        red: {
          team: '#991b1b',
          glow: '#ef4444',
        },
        gold: '#f59e0b',
        accent: '#8b5cf6',
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
}
