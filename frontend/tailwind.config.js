/**
 * Tailwind CSS v4 configuration.
 *
 * Design values themselves (hex codes, px sizes) live in ONE place:
 * src/styles/global.css `:root` — the same CSS custom properties the
 * existing JS files already read via `var(--primary)` etc. This file
 * just exposes those variables as named Tailwind utilities (bg-primary,
 * text-danger, shadow-card, rounded-lg, ...) so nothing is duplicated
 * and nothing can drift out of sync between "Tailwind colors" and
 * "the colors the app actually uses".
 */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './public/index.html',
  ],
  theme: {
    // Custom breakpoints matching the app's ACTUAL media queries today
    // (480/640/768/900/1024/1100), not Tailwind's stock scale, so every
    // responsive rule keeps behaving pixel-for-pixel the same.
    screens: {
      xs: '480px',
      sm: '640px',
      md: '768px',
      'md-lg': '900px',   // Dashboard mid-grid, JobsPage filters, business stat grids
      lg: '1024px',       // Landing Page hero split
      xl: '1100px',       // RoleSelectionPage two-column split
    },
    extend: {
      colors: {
        primary: { DEFAULT: 'var(--primary)', dark: 'var(--primary-dark)', light: 'var(--primary-light)' },
        secondary: 'var(--secondary)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: { DEFAULT: 'var(--danger)', dark: 'var(--danger-dark)' },
        'brand-dark': 'var(--brand-dark)',
        'accent-teal': 'var(--accent-teal)',
        'accent-indigo': 'var(--accent-indigo)',
        'trust-green': 'var(--trust-green)',
        text: { primary: 'var(--text-primary)', secondary: 'var(--text-secondary)', muted: 'var(--text-muted)' },
        surface: 'var(--bg-white)',
        app: 'var(--bg)',
        border: { DEFAULT: 'var(--border)', light: 'var(--border-light)' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ["'Plus Jakarta Sans'", 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      spacing: {
        'sidebar-w': 'var(--sidebar-w)',
        'topbar-h': 'var(--topbar-h)',
      },
      zIndex: {
        'sidebar-backdrop': '99',
        sidebar: '100',
        topbar: '50',
        dropdown: '200',
        modal: '1000',
        toast: '9999',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
      keyframes: {
        'page-fade-in': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'menu-in': { from: { opacity: '0', transform: 'translateY(-6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'fade-down': { from: { opacity: '0', transform: 'translateY(-8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-in': { from: { opacity: '0', transform: 'translateX(20px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
        'wave-hand': { '0%,100%': { transform: 'rotate(0deg)' }, '20%': { transform: 'rotate(16deg)' }, '40%': { transform: 'rotate(-8deg)' }, '60%': { transform: 'rotate(14deg)' } },
        'float-card': { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-14px)' } },
        'sidebar-backdrop-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        spin: 'spin 0.7s linear infinite',
        'spin-slow': 'spin 1s linear infinite',
        'page-fade-in': 'page-fade-in 0.4s ease',
        'menu-in': 'menu-in 0.15s ease',
        'fade-down': 'fade-down 0.2s ease',
        'slide-in': 'slide-in 0.3s ease',
        shimmer: 'shimmer 1.4s infinite',
        'wave-hand': 'wave-hand 1.8s ease-in-out infinite',
        'float-card': 'float-card 5s ease-in-out infinite',
        'sidebar-backdrop-in': 'sidebar-backdrop-in 0.2s ease',
      },
    },
  },
  plugins: [],
};
