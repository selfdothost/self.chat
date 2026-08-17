<script>
	import { onMount } from 'svelte';
	import { models } from '$lib/stores';
	import { getModels } from '$lib/apis';
	import Gallery from '$lib/components/studio/Tokenization/Gallery.svelte';

	// Mirrors studio/models/+page.svelte deliberately: the same populate-then-render
	// shape, so the tokenization gallery has no loading behaviour of its own to
	// diverge from the gallery it forks.
	onMount(async () => {
		models.set(await getModels(localStorage.token));
	});
</script>

{#if $models !== null}
	<Gallery />
{/if}
