<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import TagInput from './Tags/TagInput.svelte';
	import TagList from './Tags/TagList.svelte';
	import { getContext } from 'svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	interface Props {
		tags?: { name: string }[];
		// Both forward their child's payload unchanged: a bare tag-name string.
		// Consumers relied on that when this was `e.detail`, so it is deliberately
		// not upgraded to an object here.
		onAdd?: (name: string) => void;
		onDelete?: (name: string) => void;
	}

	let { tags = [], onAdd = () => {}, onDelete = () => {} }: Props = $props();
</script>

<div class="flex flex-row flex-wrap gap-1 line-clamp-1">
	<TagList {tags} {onDelete} />

	<TagInput label={tags.length == 0 ? $i18n.t('Add Tags') : ''} {onAdd} />
</div>
