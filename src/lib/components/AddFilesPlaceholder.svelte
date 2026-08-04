<script>
	import { getContext } from 'svelte';

	/**
	 * @typedef {Object} Props
	 * @property {string} [title]
	 * @property {string} [content]
	 * @property {import('svelte').Snippet} [children]
	 */

	/** @type {Props} */
	let { title = '', content = '', children } = $props();
	/** @type {import('svelte/store').Writable<import('i18next').i18n>} */
	const i18n = getContext('i18n');
</script>

<div class="px-3">
	<div class="text-center text-6xl mb-3">📄</div>
	<div class="text-center dark:text-white text-xl font-semibold z-50">
		{#if title}
			{title}
		{:else}
			{$i18n.t('Add Files')}
		{/if}
	</div>

	{#if children}{@render children()}{:else}<div class="px-2 mt-2 text-center text-sm dark:text-gray-200 w-full">
			{#if content}
				{content}
			{:else}
				{$i18n.t('Drop any files here to add to the conversation')}
			{/if}
		</div>
	{/if}
</div>
