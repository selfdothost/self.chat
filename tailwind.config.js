// Tailwind v4 is CSS-first (see src/tailwind.css: @import, @theme, @plugin, @custom-variant).
// This file survives ONLY as a bridge (via `@config '../tailwind.config.js';` in
// src/tailwind.css) for the one thing that has no CSS-first equivalent as of tailwindcss@4.3.3 /
// @tailwindcss/typography@0.5.20: overriding the typography plugin's generated CSS for specific
// elements. This app renders its own highlight.js-based code blocks (see src/app.css's .hljs-*
// rules and src/lib/components/chat/Messages/CodeBlock.svelte), so the typography plugin's
// default `pre`/`code` styling needs to stay switched off inside `.prose`/`markdown-prose`/
// `input-prose` content, exactly as it was under v3.
//
// Do NOT add `content`, `darkMode`, or `plugins` back here — those moved to CSS-first
// equivalents (@source, @custom-variant dark, @plugin) in src/tailwind.css and would be
// redundant or conflicting here.

/** @type {import('tailwindcss').Config} */
export default {
	theme: {
		extend: {
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
			}
		}
	}
};
