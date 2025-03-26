import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'
// https://github.com/tailwindlabs/tailwindcss-container-queries
import containerQueries from '@tailwindcss/container-queries'

const config: Config = {
    darkMode: 'class',
    content: ['./src/frontend/**/*.{js,ts,jsx,tsx,mdx}'],
    theme: {
        container: {
            center: true,
            padding: '2rem',
            screens: {
                '2xl': '1400px',
            },
        },
        extend: {
            colors: {
                day: '#f2f2f2', // 'white' bg
                night: '#16161c', // 'black' bg #2b2b2b #1e1e1e #16161c
                'editor-night': '#1e1e1e',
                'code-header': '#1e1e21',
                midnight: '#111111', // 'black' bg
                batman: '#2c2c2c',
                skeleton: '#262630', // #3a3a3a
                outline: {
                    day: '#f2f2f2',
                    night: '#484848',
                },
                outlinecolor: '#3d3d3d',
                orange: '#c97f59',
                aqua: '#55c2f9',
                // input: {
                //   dark: '#484848',
                // },
                primary: '#7656e8',
                'custom-blue': 'rgba(0,187,255,0.5)',
                input: 'var(--input)',
                // primary: {
                //   DEFAULT: "var(--primary)",
                //   foreground: "var(--primary-foreground)",
                // },
                border: 'var(--border)',
                ring: 'var(--ring)',
                background: 'var(--background)',
                foreground: 'var(--foreground)',
                secondary: {
                    DEFAULT: 'var(--secondary)',
                    foreground: 'var(--secondary-foreground)',
                },
                destructive: {
                    DEFAULT: 'var(--destructive)',
                    foreground: 'var(--destructive-foreground)',
                },
                muted: {
                    DEFAULT: 'var(--muted)',
                    foreground: 'var(--muted-foreground)',
                },
                accent: {
                    DEFAULT: 'var(--accent)',
                    foreground: 'var(--accent-foreground)',
                },
                popover: {
                    DEFAULT: 'var(--popover)',
                    foreground: 'var(--popover-foreground)',
                },
                card: {
                    DEFAULT: 'var(--card)',
                    foreground: 'var(--card-foreground)',
                },
            },
            backgroundImage: {
                'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
                'gradient-conic':
                    'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
            },
            transitionDelay: {
                '800': '800ms',
            },
            animation: {
                pulse2: 'pulse2 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                pulse3: 'pulse3 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'pulse-size': 'pulse-size 4s infinite',
                'pulse-size-lg': 'pulse-size-lg 2s infinite',
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out',
                lineGrow: 'lineGrow 2s ease-in-out forwards',
                'fade-in': 'fade-in 0.5s ease-out',
            },
            keyframes: {
                pulse2: {
                    '0%, 100%': { opacity: '0.5' },
                    '50%': { opacity: '0.2' },
                },
                pulse3: {
                    '0%, 100%': { opacity: '0.7' },
                    '50%': { opacity: '0.4' },
                },
                'pulse-size': {
                    '0%, 100%': { transform: 'scale(1)', opacity: '0.4' },
                    '50%': { transform: 'scale(0.3)', opacity: '0.6' },
                },
                'pulse-size-lg': {
                    '0%': { transform: 'scale(1)', opacity: '1' },
                    '80%': { transform: 'scale(2.5)', opacity: '0' },
                    '100%': { transform: 'scale(2.5)', opacity: '0' },
                },
                'accordion-down': {
                    from: { height: '0' },
                    to: { height: 'var(--radix-accordion-content-height)' },
                },
                'accordion-up': {
                    from: { height: 'var(--radix-accordion-content-height)' },
                    to: { height: '0' },
                },
                lineGrow: {
                    '0%': { height: '0%' },
                    '100%': { height: '100%' },
                },
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
            },
        },
    },
    plugins: [animate, containerQueries],
}
export default config
