<script>
	import { marked } from 'marked';
	import { replaceTokens, processResponseContent } from '$lib/utils';
	import { user } from '$lib/stores';

	import markedExtension from '$lib/utils/marked/extension';
	import markedKatexExtension from '$lib/utils/marked/katex-extension';

	import MarkdownTokens from './Markdown/MarkdownTokens.svelte';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	

	/**
	 * @typedef {Object} Props
	 * @property {any} id
	 * @property {any} content
	 * @property {any} [model]
	 * @property {boolean} [save]
	 * @property {any} [sourceIds]
	 * @property {any} [onSourceClick]
	 */

	/** @type {Props} */
	let {
		id,
		content,
		model = null,
		save = false,
		sourceIds = [],
		onSourceClick = () => {}
	} = $props();

	let tokens = $state([]);

	const options = {
		throwOnError: false
	};

	marked.use(markedKatexExtension(options));
	marked.use(markedExtension(options));

	$effect(() => {
		(async () => {
			if (content) {
				tokens = marked.lexer(
					replaceTokens(processResponseContent(content), sourceIds, model?.name, $user?.name)
				);
			}
		})();
	});
</script>

{#key id}
	<MarkdownTokens
		{tokens}
		{id}
		{save}
		{onSourceClick}
		on:update={(e) => {
			dispatch('update', e.detail);
		}}
		on:code={(e) => {
			dispatch('code', e.detail);
		}}
	/>
{/key}
