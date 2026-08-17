<script lang="ts">
	import type { Model } from '$lib/stores';


	import { knowledge, prompts } from '$lib/stores';

	import { removeLastWordFromString } from '$lib/utils';
	import { getPrompts } from '$lib/apis/prompts';
	import { getKnowledgeBases } from '$lib/apis/knowledge';

	import Prompts from './Commands/Prompts.svelte';
	import Knowledge from './Commands/Knowledge.svelte';
	import Models from './Commands/Models.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';

	interface Props {
		prompt?: string;
		/* eslint-disable @typescript-eslint/no-explicit-any */
		files?: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
		// onUpload carries { type: 'youtube' | 'web', data: url }.
		// onSelect is called TWO WAYS and MessageInput branches on it: with no
		// argument after a knowledge pick, and with { type: 'model', data } after a
		// model pick. Keeping the argument optional preserves both call shapes.
		onUpload?: (detail: { type: string; data: unknown }) => void;
		onSelect?: (detail?: { type: string; data: Model }) => void;
	}

	let {
		prompt = $bindable(''),
		files = $bindable([]),
		onUpload = () => {},
		onSelect = () => {}
	}: Props = $props();

	let loading = $state(false);
	let commandElement = $state(null);

	export const selectUp = () => {
		commandElement?.selectUp();
	};

	export const selectDown = () => {
		commandElement?.selectDown();
	};

	let command = $derived(prompt?.split('\n').pop()?.split(' ')?.pop() ?? '');

	let show = $derived(
		['/', '#', '@'].includes(command?.charAt(0)) || '\\#' === command.slice(0, 2)
	);


		// Svelte compiles $: blocks in dependency order, not source order --
	// this is called from an earlier reactive block despite being declared
	// here. ESLint's static top-down analysis can't see that reordering.
	 
	const init = async () => {
		loading = true;
		await Promise.all([
			(async () => {
				prompts.set(await getPrompts(localStorage.token));
			})(),
			(async () => {
				knowledge.set(await getKnowledgeBases(localStorage.token));
			})()
		]);
		loading = false;
	};
	$effect(() => {
		if (show) {
			init();
		}
	});
</script>

{#if show}
	{#if !loading}
		{#if command?.charAt(0) === '/'}
			<Prompts bind:this={commandElement} bind:prompt bind:files {command} />
		{:else if (command?.charAt(0) === '#' && command.startsWith('#') && !command.includes('# ')) || ('\\#' === command.slice(0, 2) && command.startsWith('#') && !command.includes('# '))}
			<Knowledge
				bind:this={commandElement}
				bind:prompt
				command={command.includes('\\#') ? command.slice(2) : command}
				onYoutube={(url) => {
					onUpload({
						type: 'youtube',
						data: url
					});
				}}
				onUrl={(url) => {
					onUpload({
						type: 'web',
						data: url
					});
				}}
				onSelect={(item) => {
					files = [
						...files,
						{
							...(item as object),
							status: 'processed'
						}
					];

					onSelect();
				}}
			/>
		{:else if command?.charAt(0) === '@'}
			<Models
				bind:this={commandElement}
				{command}
				onSelect={(model) => {
					prompt = removeLastWordFromString(prompt, command);

					onSelect({
						type: 'model',
						data: model
					});
				}}
			/>
		{/if}
	{:else}
		<div
			id="commands-container"
			class="px-2 mb-2 text-left w-full absolute bottom-0 left-0 right-0 z-10"
		>
			<div class="flex w-full rounded-xl border border-gray-50 dark:border-gray-850">
				<div
					class="max-h-60 flex flex-col w-full rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100"
				>
					<Spinner />
				</div>
			</div>
		</div>
	{/if}
{/if}
