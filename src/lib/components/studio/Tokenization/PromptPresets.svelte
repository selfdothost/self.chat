<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { getContext, onMount } from 'svelte';

	import { getPrompts } from '$lib/apis/prompts';
	import { offerablePrompts, type PresetPrompt } from './prompt-presets';

	import DropdownMenuContent from '$lib/components/common/DropdownMenuContent.svelte';
	import Dropdown from '$lib/components/common/Dropdown.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import Document from '$lib/components/icons/Document.svelte';

	// Tokenization Studio Shell R6 — T-209 of
	// context/plans/build-site-tokenization-shell.md.
	//
	// Saved prompts, selectable as user-prompt presets in the tokenization
	// composer. Rationale (treasuremap Decision 8): holding the prompt fixed
	// while varying the model is how an artist actually tells two characters
	// apart, so the prompt has to be trivially repeatable.
	//
	// ACCESS CONTROL IS NOT REIMPLEMENTED HERE (R6-AC1/AC4). `getPrompts` is the
	// existing endpoint the `/command` autocomplete already calls; the server
	// returns only the prompts this user may access. We never widen that list —
	// `offerablePrompts` only ever narrows it — and nothing on this surface
	// creates, edits or deletes a prompt.
	//
	// VARIABLES ARE UNSUPPORTED HERE and prompts using them are excluded; the
	// full reasoning lives with the rule, in `prompt-presets.ts`.

	const i18n: Writable<i18nType> = getContext('i18n');

	interface Props {
		/** Hands the chosen prompt's body to the composer. The caller decides what
		 *  "insert" means; this component does not reach into the input itself. */
		onSelect: (content: string) => void;
	}

	let { onSelect }: Props = $props();

	let fetched: Partial<PresetPrompt>[] = $state([]);
	let show = $state(false);

	const offerable = $derived(offerablePrompts(fetched));

	onMount(async () => {
		// A failed fetch leaves the list empty, which renders nothing at all. That
		// is the right failure: a picker that opens onto an empty list reads as
		// "you have no prompts", which would be a lie.
		fetched = (await getPrompts(localStorage.token).catch(() => [])) ?? [];
	});
</script>

<!--
	R6-AC5 — ABSENT, not empty. A user with no accessible prompts (or with only
	variable-using ones) gets no control at all, rather than a button that opens
	onto nothing. This is also why the list is not rendered optimistically while
	loading: an empty frame that later fills is the same lie, briefly.
-->
{#if offerable.length > 0}
	<Dropdown bind:show>
		<Tooltip content={$i18n.t('Prompts')}>
			<button
				class="bg-transparent hover:bg-white/80 text-gray-800 dark:text-white dark:hover:bg-gray-800 transition rounded-full p-2 outline-hidden focus:outline-hidden"
				type="button"
				aria-label={$i18n.t('Prompts')}
			>
				<Document className="size-5" />
			</button>
		</Tooltip>

		{#snippet content()}
			<DropdownMenuContent
				class="w-full max-w-[275px] rounded-xl px-1 py-1 border-gray-300/30 dark:border-gray-700/50 z-50 bg-white dark:bg-gray-850 dark:text-white shadow"
				sideOffset={15}
				alignOffset={-8}
				side="top"
				align="start"
			>
				<div class="max-h-60 overflow-y-auto scrollbar-hidden">
					{#each offerable as preset (preset.command)}
						<button
							class="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm font-medium cursor-pointer rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800"
							type="button"
							onclick={() => {
								// R6-AC2 — the body lands in the composer as ordinary editable
								// text. Nothing is stored, locked or remembered: the artist is
								// free to edit it before sending, and a preset is a starting
								// point rather than a value the session holds them to.
								onSelect(preset.content);
								show = false;
							}}
						>
							<div class="truncate">{preset.title}</div>
							<div class="truncate text-xs text-gray-500 dark:text-gray-400">
								{preset.command}
							</div>
						</button>
					{/each}
				</div>
			</DropdownMenuContent>
		{/snippet}
	</Dropdown>
{/if}
