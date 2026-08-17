<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { user } from '$lib/stores';
	import { onMount } from 'svelte';

	onMount(() => {
		if ($user?.role !== 'admin') {
			if ($user?.permissions?.studio?.models) {
				goto(resolve('/(app)/studio/models'));
			} else if ($user?.permissions?.studio?.knowledge) {
				goto(resolve('/(app)/studio/knowledge'));
			} else if ($user?.permissions?.studio?.prompts) {
				goto(resolve('/(app)/studio/prompts'));
			} else if ($user?.permissions?.studio?.training) {
				goto(resolve('/(app)/studio/training'));
			} else if ($user?.permissions?.studio?.evaluations) {
				goto(resolve('/(app)/studio/evaluations'));
			} else if ($user?.permissions?.studio?.tools) {
				goto(resolve('/(app)/studio/tools'));
			} else if ($user?.permissions?.studio?.tokenization) {
				// Last in the chain deliberately: an artist who also holds an older
				// Studio permission should land where they always did. Without this
				// branch a tokenization-only user reaching /studio falls through to
				// the `/` redirect below and can never navigate to the one section
				// they hold -- the permission would grant a page with no route to it.
				goto(resolve('/(app)/studio/tokenization'));
			} else {
				goto(resolve('/'));
			}
		} else {
			goto(resolve('/(app)/studio/models'));
		}
	});
</script>
