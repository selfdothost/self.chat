<script lang="ts">
	import { Switch } from 'bits-ui';
	import type { AnyFn } from '$lib/types';
	interface Props {
		state?: boolean;
		onChange?: AnyFn;
	}

	let { state = $bindable(true), onChange = () => {} }: Props = $props();

	// Call onChange only on genuine user interaction (bits-ui's onCheckedChange),
	// NOT via a `$: onChange(state)` reactive statement. That fired
	// on every invalidation of `state`, including a parent simply reassigning
	// the bound prop (e.g. after refetching a list) -- with no real user
	// action involved. Confirmed root cause of a production incident: a
	// toggle-then-refetch-the-list pattern created a self-sustaining loop
	// where every visible Switch re-fired 'change' on each refetch, batch
	// re-toggling every rendered model repeatedly. Inherited unchanged since
	// the original OWUI fork commit; something in the Svelte 5 migration
	// changed the timing/aggressiveness enough to turn this from a latent
	// bug into an active one.
	const handleCheckedChange = (checked: boolean) => {
		onChange(checked);
	};
</script>

<Switch.Root
	bind:checked={state}
	onCheckedChange={handleCheckedChange}
	class="flex h-5 min-h-5 w-9 shrink-0 cursor-pointer items-center rounded-full px-[3px] mx-[1px] transition  {state
		? ' bg-emerald-600'
		: 'bg-gray-200 dark:bg-transparent'} outline outline-1 outline-gray-100 dark:outline-gray-800"
>
	<Switch.Thumb
		class="pointer-events-none block size-4 shrink-0 rounded-full bg-white transition-transform data-[state=checked]:translate-x-3.5 data-[state=unchecked]:translate-x-0 data-[state=unchecked]:shadow-mini "
	/>
</Switch.Root>
