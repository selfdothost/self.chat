<script lang="ts">
	import Collapsible from './Collapsible.svelte';

	interface Props {
		onChange?: (open: boolean) => void;
		// Changing this re-renders the parent, which recreates the inline arrow
		// below with a fresh identity. That is the whole point of the harness.
		tick?: number;
	}

	let { onChange = () => {}, tick = 0 }: Props = $props();
</script>

<span data-testid="tick">{tick}</span>

<!-- Deliberately an INLINE arrow, not `{onChange}`: a stable reference would
     not exercise the identity-change path at all. -->
<Collapsible title="Section" onChange={(open) => onChange(open)}>
	{#snippet content()}
		<div data-testid="body">BODY</div>
	{/snippet}
</Collapsible>
