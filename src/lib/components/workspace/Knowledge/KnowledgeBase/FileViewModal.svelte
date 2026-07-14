<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { getContext } from 'svelte';
	const i18n: Writable<i18nType> = getContext('i18n');

	import RichTextInput from '$lib/components/common/RichTextInput.svelte';

	// File item shape varies by upload path — accessed dynamically rather than
	// through one consistent interface, same as the rest of the KnowledgeBase tree.
	// The parent always coerces `data` to `{ content: '' }` before handing us
	// a file, so `file.data.content` is safe to bind here.
	export let file;

	// The extracted `data.content` is what's actually chunked/embedded, so it's
	// meaningful to edit for real text — but for binary types (images, pdf,
	// audio, ...) it's an OCR/parse artifact, not something a user should hand-edit.
	const TEXT_CONTENT_TYPES = [
		'application/json',
		'application/xml',
		'application/x-yaml',
		'application/x-sh',
		'application/javascript'
	];

	$: contentType = file?.meta?.content_type ?? '';
	$: isEditable =
		!contentType || contentType.startsWith('text/') || TEXT_CONTENT_TYPES.includes(contentType);
</script>

<div
	class="flex-1 w-full h-full max-h-full text-sm bg-transparent outline-none overflow-y-auto scrollbar-hidden"
>
	{#if isEditable}
		{#key file.id}
			<RichTextInput
				className="input-prose-sm"
				bind:value={file.data.content}
				placeholder={$i18n.t('Add content here')}
				preserveBreaks={true}
			/>
		{/key}
	{:else}
		<div class="h-full flex flex-col items-center justify-center gap-2 text-gray-500 text-sm">
			<div>{$i18n.t('Preview is not available for this file type.')}</div>
			<a
				class="text-xs underline hover:text-gray-700 dark:hover:text-gray-300"
				href={`/api/v1/files/${file.id}/content`}
				target="_blank"
				rel="external"
			>
				{$i18n.t('Open file')}
			</a>
		</div>
	{/if}
</div>
