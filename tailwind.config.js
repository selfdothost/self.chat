import typography from '@tailwindcss/typography';

// Tailwind can't decompose a bare var(--x, #hex) into r/g/b channels, so
// opacity modifiers (bg-gray-400/5, dark:hover:bg-white/5, ...) silently
// generate no CSS at all for colors defined that way. color-mix() lets
// Tailwind blend against the custom property without needing raw channels,
// restoring opacity-modifier support while keeping --color-gray-* usable
// as a plain color for mods (self.crew#141).
// Tailwind's bg/text/border-opacity core plugins call this fn even for
// unmodified classes (bg-gray-400), passing opacityValue as a --tw-*-opacity
// var placeholder string, not a number -- only a real /NN modifier passes a
// number. Must guard on typeof or the placeholder case produces NaN%.
function withOpacity(variableName, fallback) {
	return ({ opacityValue }) => {
		const numeric = Number(opacityValue);
		return opacityValue !== undefined && !Number.isNaN(numeric)
			? `color-mix(in srgb, var(${variableName}, ${fallback}) ${numeric * 100}%, transparent)`
			: `var(${variableName}, ${fallback})`;
	};
}

/** @type {import('tailwindcss').Config} */
export default {
	darkMode: 'class',
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				white: withOpacity('--color-white', '#fff'),
				black: withOpacity('--color-black', '#000'),
				gray: {
					50: withOpacity('--color-gray-50', '#f9f9f9'),
					100: withOpacity('--color-gray-100', '#ececec'),
					200: withOpacity('--color-gray-200', '#e3e3e3'),
					300: withOpacity('--color-gray-300', '#cdcdcd'),
					400: withOpacity('--color-gray-400', '#b4b4b4'),
					500: withOpacity('--color-gray-500', '#9b9b9b'),
					600: withOpacity('--color-gray-600', '#676767'),
					700: withOpacity('--color-gray-700', '#4e4e4e'),
					800: withOpacity('--color-gray-800', '#333'),
					850: withOpacity('--color-gray-850', '#262626'),
					900: withOpacity('--color-gray-900', '#171717'),
					950: withOpacity('--color-gray-950', '#0d0d0d')
				}
			},
			typography: {
				DEFAULT: {
					css: {
						pre: false,
						code: false,
						'pre code': false,
						'code::before': false,
						'code::after': false
					}
				}
			},
			padding: {
				'safe-bottom': 'env(safe-area-inset-bottom)'
			}
		}
	},
	plugins: [typography]
};
