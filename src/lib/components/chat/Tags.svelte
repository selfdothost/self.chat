<script lang="ts">
	import { addTagById, deleteTagById, getAllTags, getTagsById, updateChatById } from '$lib/apis/chats';
	import { tags as _tags } from '$lib/stores';
	import { onMount } from 'svelte';

	import Tags from '../common/Tags.svelte';
	import { toast } from 'svelte-sonner';

	interface Props {
		chatId?: string;
		// These emit `{ name }` objects, NOT the bare string that common/Tags
		// forwards -- consumers read `e.detail.name`, so the shape is preserved.
		onAdd?: (tag: { name: string }) => void;
		onDelete?: (tag: { name: string }) => void;
	}

	let { chatId = '', onAdd = () => {}, onDelete = () => {} }: Props = $props();
	let tags = $state([]);

	const getTags = async () => {
		return await getTagsById(localStorage.token, chatId).catch(async (_error) => {
			return [];
		});
	};

	const addTag = async (tagName) => {
		const res = await addTagById(localStorage.token, chatId, tagName).catch(async (error) => {
			toast.error(error);
			return null;
		});
		if (!res) {
			return;
		}

		tags = await getTags();
		await updateChatById(localStorage.token, chatId, {
			tags: tags
		});

		await _tags.set(await getAllTags(localStorage.token));
		onAdd({
			name: tagName
		});
	};

	const deleteTag = async (tagName) => {
		await deleteTagById(localStorage.token, chatId, tagName);
		tags = await getTags();
		await updateChatById(localStorage.token, chatId, {
			tags: tags
		});

		await _tags.set(await getAllTags(localStorage.token));
		onDelete({
			name: tagName
		});
	};

	onMount(async () => {
		if (chatId) {
			tags = await getTags();
		}
	});
</script>

<Tags {tags} onDelete={deleteTag} onAdd={addTag} />
