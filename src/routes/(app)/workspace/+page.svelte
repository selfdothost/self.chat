<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { user } from '$lib/stores';
	import { onMount } from 'svelte';

	onMount(() => {
		if ($user?.role !== 'admin') {
			if ($user?.permissions?.workspace?.models) {
				goto(resolve('/(app)/workspace/models'));
			} else if ($user?.permissions?.workspace?.knowledge) {
				goto(resolve('/(app)/workspace/knowledge'));
			} else if ($user?.permissions?.workspace?.prompts) {
				goto(resolve('/(app)/workspace/prompts'));
			} else if ($user?.permissions?.workspace?.training) {
				goto(resolve('/(app)/workspace/training'));
			} else if ($user?.permissions?.workspace?.evaluations) {
				goto(resolve('/(app)/workspace/evaluations'));
			} else if ($user?.permissions?.workspace?.tools) {
				goto(resolve('/(app)/workspace/tools'));
			} else {
				goto(resolve('/'));
			}
		} else {
			goto(resolve('/(app)/workspace/models'));
		}
	});
</script>
