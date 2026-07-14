import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import cypress from 'eslint-plugin-cypress';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import svelteConfig from './svelte.config.js';

export default defineConfig(
	{
		// Flat config has no .eslintignore -- this replaces it entirely.
		ignores: [
			'.DS_Store',
			'build/**',
			'.svelte-kit/**',
			'package/**',
			'.env',
			'.env.*',
			// Vendored third-party bundle fetched at build time
			// (see scripts/prepare-pyodide.js) -- not authored source, never lint-worthy.
			'static/pyodide/**'
		]
	},
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	{
		languageOptions: {
			sourceType: 'module',
			ecmaVersion: 2020,
			globals: {
				...globals.browser,
				...globals.node,
				...globals.es2017
			}
		},
		rules: {
			// Function parameters that must stay in place for callback-signature shape
			// (e.g. `(event, index) => {...}` where only `event` is used) are marked
			// with a leading underscore instead of deleted. No pattern was configured
			// previously, so every such parameter was flagged as a hard error.
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	{
		files: ['cypress/**/*.{js,ts}'],
		extends: [cypress.configs.recommended]
	},
	eslintConfigPrettier
);
