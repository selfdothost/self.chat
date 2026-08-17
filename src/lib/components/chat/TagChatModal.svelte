<script lang="ts">
	import type { AnyFn } from '$lib/types';
	import Modal from '../common/Modal.svelte';

	import Tags from '../common/Tags.svelte';


	interface Props {
		/* eslint-disable @typescript-eslint/no-explicit-any */
		tags: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
		deleteTag: AnyFn;
		addTag: AnyFn;
		show?: boolean;
	}

	let {
		tags,
		deleteTag,
		addTag,
		show = $bindable(false)
	}: Props = $props();
</script>

<Modal bind:show size="xs">
	<div class="px-4 pt-4 pb-5 w-full flex flex-col justify-center">
		<Tags {tags} onDelete={deleteTag} onAdd={addTag} />
	</div>
</Modal>
