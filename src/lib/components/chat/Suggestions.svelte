<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import Bolt from '$lib/components/icons/Bolt.svelte';
	import { getContext } from 'svelte';
	import type { AnyFn } from '$lib/types';

	const i18n: Writable<i18nType> = getContext('i18n');

	interface Props {
		/* eslint-disable @typescript-eslint/no-explicit-any */
		suggestionPrompts?: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
		className?: string;
		onSelect?: AnyFn;
	}

	let { suggestionPrompts = [], className = '', onSelect = () => {} }: Props = $props();

	let prompts = $derived((suggestionPrompts ?? [])
		.reduce((acc, current) => [...acc, ...[current]], [])
		.sort(() => Math.random() - 0.5));

	
</script>

{#if prompts.length > 0}
	<div class="mb-1 flex gap-1 text-sm font-medium items-center text-gray-400 dark:text-gray-600">
		<Bolt />
		{$i18n.t('Suggested')}
	</div>
{/if}

<div class=" h-40 max-h-full overflow-auto scrollbar-none {className}">
	{#each prompts as prompt, _promptIdx (prompt.content)}
		<button
			class="flex flex-col flex-1 shrink-0 w-full justify-between px-3 py-2 rounded-xl bg-transparent hover:bg-black/5 dark:hover:bg-white/5 transition group"
			onclick={() => {
				onSelect(prompt.content);
			}}
		>
			<div class="flex flex-col text-left">
				{#if prompt.title && prompt.title[0] !== ''}
					<div
						class="  font-medium dark:text-gray-300 dark:group-hover:text-gray-200 transition line-clamp-1"
					>
						{prompt.title[0]}
					</div>
					<div class="text-xs text-gray-500 font-normal line-clamp-1">{prompt.title[1]}</div>
				{:else}
					<div
						class="  font-medium dark:text-gray-300 dark:group-hover:text-gray-200 transition line-clamp-1"
					>
						{prompt.content}
					</div>

					<div class="text-xs text-gray-500 font-normal line-clamp-1">Prompt</div>
				{/if}
			</div>
		</button>
	{/each}
</div>
