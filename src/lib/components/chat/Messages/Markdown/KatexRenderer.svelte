<script lang="ts">
	import katex from 'katex';
	import 'katex/contrib/mhchem';
	import 'katex/dist/katex.min.css';

	export let content: string;
	export let displayMode: boolean = false;
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- katex.renderToString() defaults to trust: false (not set here, so KaTeX's secure default applies), which blocks HTML/URL-injecting commands like \href and \includegraphics -->
{@html katex.renderToString(content, { displayMode, throwOnError: false })}
