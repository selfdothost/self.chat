<script>
	import { marked } from 'marked';
	import { replaceTokens, processResponseContent } from '$lib/utils';
	import { user } from '$lib/stores';

	import markedExtension from '$lib/utils/marked/extension';
	import markedKatexExtension from '$lib/utils/marked/katex-extension';

	import MarkdownTokens from './Markdown/MarkdownTokens.svelte';

	

	/**
	 * @typedef {Object} Props
	 * @property {any} id
	 * @property {any} content
	 * @property {any} [model]
	 * @property {boolean} [save]
	 * @property {any} [sourceIds]
	 * @property {any} [onSourceClick]
	 * @property {any} [onUpdate] forwarded from MarkdownTokens: { raw, oldContent, newContent }
	 * @property {any} [onCode] forwarded from MarkdownTokens: { lang, code }
	 */

	/** @type {Props} */
	let {
		id,
		content,
		model = null,
		save = false,
		sourceIds = [],
		onSourceClick = () => {},
		onUpdate = () => {},
		onCode = () => {}
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
		{onUpdate}
		{onCode}
	/>
{/key}
