<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { getContext } from 'svelte';
	import { slide } from 'svelte/transition';

	import ChevronDown from '$lib/components/icons/ChevronDown.svelte';
	import ChevronUp from '$lib/components/icons/ChevronUp.svelte';
	import LightBlub from '$lib/components/icons/LightBlub.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	// Model thinking, carried on its own field so it is never mixed into the answer.
	// Today only Anthropic models populate it (self.ai#59); every other provider
	
	// Whether the surrounding message is still streaming, so we can show the
	
	interface Props {
		// leaves it empty and this component renders nothing.
		reasoning?: string;
		// thinking as live rather than as a finished artifact.
		done?: boolean;
	}

	let { reasoning = '', done = true }: Props = $props();

	let expanded = $state(false);
</script>

{#if reasoning}
	<div class="mt-1 mb-2 w-full">
		<button
			class="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
			onclick={() => (expanded = !expanded)}
			aria-expanded={expanded}
		>
			<LightBlub className="size-3.5" />
			<span class={done ? '' : 'pulse'}>
				{done ? $i18n.t('Thought process') : $i18n.t('Thinking...')}
			</span>
			{#if expanded}
				<ChevronUp className="size-3" strokeWidth="2.5" />
			{:else}
				<ChevronDown className="size-3" strokeWidth="2.5" />
			{/if}
		</button>

		{#if expanded}
			<div transition:slide={{ duration: 150 }}>
				<div
					class="mt-1.5 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words rounded-lg border-l-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-850 text-gray-600 dark:text-gray-400 max-h-96 overflow-y-auto"
				>
					{reasoning}
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.6;
		}
	}

	.pulse {
		animation: pulse 1.5s ease infinite;
	}
</style>
