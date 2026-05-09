import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const palette = {
  theme: '#4f46e5',
  black: '#111827',
  white: '#ffffff',
  red: '#dc2626',
  yellow: '#d97706',
  green: '#059669',
  blue: '#2563eb',
}

const hexToRgb = (hex) => {
  const normalized = hex.replace('#', '')
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized

  const parsed = Number.parseInt(value, 16)
  const r = (parsed >> 16) & 255
  const g = (parsed >> 8) & 255
  const b = parsed & 255
  return `${r} ${g} ${b}`
}

const withAlpha = (hex, alpha = 1) => `rgb(${hexToRgb(hex)} / ${alpha})`

const semanticScale = (hex) => ({
  50: withAlpha(hex, 0.08),
  100: withAlpha(hex, 0.12),
  200: withAlpha(hex, 0.18),
  300: withAlpha(hex, 0.28),
  400: withAlpha(hex, 0.42),
  500: withAlpha(hex, 0.72),
  600: hex,
  700: hex,
  800: hex,
  900: hex,
})

const neutralScale = {
  50: palette.white,
  100: withAlpha(palette.black, 0.04),
  200: withAlpha(palette.black, 0.08),
  300: withAlpha(palette.black, 0.14),
  400: withAlpha(palette.black, 0.24),
  500: withAlpha(palette.black, 0.42),
  600: withAlpha(palette.black, 0.62),
  700: withAlpha(palette.black, 0.78),
  800: withAlpha(palette.black, 0.9),
  900: palette.black,
}

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'apps/*/index.html'),
    path.join(__dirname, 'apps/*/src/**/*.{ts,tsx}'),
    path.join(__dirname, 'src/**/*.{ts,tsx}'),
  ],
  theme: {
    borderRadius: {
      none: '0',
      sm: '0.625rem',
      DEFAULT: '0.875rem',
      md: '0.875rem',
      lg: '1rem',
      xl: '1.125rem',
      '2xl': '1.375rem',
      '3xl': '1.75rem',
      full: '9999px',
    },
    extend: {
      colors: {
        gray: neutralScale,
        slate: neutralScale,
        zinc: neutralScale,
        neutral: neutralScale,
        stone: neutralScale,
        blue: semanticScale(palette.blue),
        indigo: semanticScale(palette.theme),
        violet: semanticScale(palette.theme),
        purple: semanticScale(palette.theme),
        emerald: semanticScale(palette.green),
        green: semanticScale(palette.green),
        lime: semanticScale(palette.green),
        yellow: semanticScale(palette.yellow),
        amber: semanticScale(palette.yellow),
        orange: semanticScale(palette.yellow),
        red: semanticScale(palette.red),
        rose: semanticScale(palette.red),
      },
      boxShadow: {
        sm: '0 1px 2px rgb(17 24 39 / 0.04)',
        DEFAULT: '0 2px 6px rgb(17 24 39 / 0.06)',
        md: '0 3px 8px rgb(17 24 39 / 0.08)',
        lg: '0 4px 10px rgb(17 24 39 / 0.08)',
        xl: '0 5px 12px rgb(17 24 39 / 0.08)',
        '2xl': '0 6px 18px rgb(17 24 39 / 0.08)',
      },
    },
  },
  plugins: [],
}
