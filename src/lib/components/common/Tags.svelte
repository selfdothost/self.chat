<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import TagInput from './Tags/TagInput.svelte';
	import TagList from './Tags/TagList.svelte';
	import { getContext, createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	const i18n: Writable<i18nType> = getContext('i18n');

	let { tags = [] } = $props();
</script>

<div class="flex flex-row flex-wrap gap-1 line-clamp-1">
	<TagList
		{tags}
		on:delete={(e) => {
			dispatch('delete', e.detail);
		}}
	/>

	<TagInput
		label={tags.length == 0 ? $i18n.t('Add Tags') : ''}
		on:add={(e) => {
			dispatch('add', e.detail);
		}}
	/>
</div>
