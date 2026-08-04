<script>
	import { onMount } from 'svelte';
	import { voices } from '$lib/stores';

	import { getVoices } from '$lib/apis/voices';
	import Voices from '$lib/components/workspace/Voices.svelte';

	onMount(async () => {
		await Promise.all([
			(async () => {
				voices.set(await getVoices(localStorage.token));
			})()
		]);
	});
</script>

{#if $voices !== null}
	<Voices />
{/if}
