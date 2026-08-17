<script lang="ts">
	import { untrack } from 'svelte';

	import { slide } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	import ChevronUp from '../icons/ChevronUp.svelte';
	import ChevronDown from '../icons/ChevronDown.svelte';



	interface Props {
		open?: boolean;
		className?: string;
		buttonClassName?: string;
		/* eslint-disable @typescript-eslint/no-explicit-any */
		title?: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
		grow?: boolean;
		disabled?: boolean;
		hide?: boolean;
		// Fires with the current `open` state, INCLUDING once on mount -- the
		// dispatch this replaces lived in an $effect, so consumers already receive
		// an initial call before any interaction. Preserved deliberately.
		onChange?: (open: boolean) => void;
		children?: import('svelte').Snippet;
		content?: import('svelte').Snippet;
	}

	let {
		open = $bindable(false),
		className = '',
		buttonClassName = 'w-fit text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition',
		title = null,
		grow = false,
		disabled = false,
		hide = false,
		onChange = () => {},
		children,
		content
	}: Props = $props();

	$effect(() => {
		// `open` is read tracked; the callback is not. The event dispatcher this
		// replaces was a stable const, so this effect's only dependency was ever
		// `open`. Reading `onChange` tracked instead would re-run whenever its
		// IDENTITY changed -- and a consumer passing an inline arrow recreates that
		// on every parent render, firing duplicate change events for an unchanged
		// `open`.
		const value = open;
		untrack(() => onChange(value));
	});
</script>

<div class={className}>
	{#if title !== null}
		<div
			class="{buttonClassName} cursor-pointer"
			onpointerup={() => {
				if (!disabled) {
					open = !open;
				}
			}}
		>
			<div class=" w-full font-medium flex items-center justify-between gap-2">
				<div class="">
					{title}
				</div>

				<div>
					{#if open}
						<ChevronUp strokeWidth="3.5" className="size-3.5" />
					{:else}
						<ChevronDown strokeWidth="3.5" className="size-3.5" />
					{/if}
				</div>
			</div>
		</div>
	{:else}
		<div
			class="{buttonClassName} cursor-pointer"
			onpointerup={() => {
				if (!disabled) {
					open = !open;
				}
			}}
		>
			<div>
				{@render children?.()}

				{#if grow}
					{#if open && !hide}
						<div
							transition:slide={{ duration: 300, easing: quintOut, axis: 'y' }}
							onpointerup={(e) => {
								e.stopPropagation();
							}}
						>
							{@render content?.()}
						</div>
					{/if}
				{/if}
			</div>
		</div>
	{/if}

	{#if !grow}
		{#if open && !hide}
			<div transition:slide={{ duration: 300, easing: quintOut, axis: 'y' }}>
				{@render content?.()}
			</div>
		{/if}
	{/if}
</div>
