<script lang="ts">
	import type { AnyFn } from '$lib/types';

	interface Props {
		state?: string;
		indeterminate?: boolean;
		onChange?: AnyFn;
	}

	// Renamed on destructure: a local variable literally named `state` collides
	// with the $state rune at runtime (Svelte misreads `$state(...)` as
	// auto-subscribing to a store named `state`, confirmed by
	// FolderConfigModal.test.ts's `store_invalid_shape` failure) -- the external
	// prop name is unaffected, callers still pass `state={...}`.
	let {
		state: stateProp = 'unchecked',
		indeterminate = false,
		onChange = () => {}
	}: Props = $props();

	// _state mirrors the `state` prop but is also toggled locally by clicks
	// (see the click handler below) -- a writable $derived: reassigning it is a
	// local override that holds until `stateProp` itself changes again, which
	// is exactly "re-synced on prop change, but locally toggleable" (Svelte
	// 5.25+, svelte/prefer-writable-derived).
	let _state = $derived(stateProp);
</script>

<button
	class=" outline -outline-offset-1 outline-[1.5px] outline-gray-200 dark:outline-gray-600 {stateProp !==
	'unchecked'
		? 'bg-black outline-black '
		: 'hover:outline-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'} text-white transition-all rounded inline-block w-3.5 h-3.5 relative"
	onclick={() => {
		if (_state === 'unchecked') {
			_state = 'checked';
			onChange(_state);
		} else if (_state === 'checked') {
			_state = 'unchecked';
			if (!indeterminate) {
				onChange(_state);
			}
		} else if (indeterminate) {
			_state = 'checked';
			onChange(_state);
		}
	}}
	type="button"
>
	<div class="top-0 left-0 absolute w-full flex justify-center">
		{#if _state === 'checked'}
			<svg
				class="w-3.5 h-3.5"
				aria-hidden="true"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke="currentColor"
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="3"
					d="m5 12 4.7 4.5 9.3-9"
				/>
			</svg>
		{:else if indeterminate}
			<svg
				class="w-3 h-3.5 text-gray-800 dark:text-white"
				aria-hidden="true"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke="currentColor"
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="3"
					d="M5 12h14"
				/>
			</svg>
		{/if}
	</div>

	<!-- {checked} -->
</button>
