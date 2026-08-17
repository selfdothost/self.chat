<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import dayjs from 'dayjs';
	import { v4 as uuidv4 } from 'uuid';
	import { toast } from 'svelte-sonner';
	import { getContext } from 'svelte';
	const i18n: Writable<i18nType> = getContext('i18n');

	import { uploadFile } from '$lib/apis/files';
	import { addFileToVoiceById, removeFileFromVoiceById } from '$lib/apis/voices';
	import { getUserById } from '$lib/apis/users';
	import { formatFileSize } from '$lib/utils';

	import Spinner from '$lib/components/common/Spinner.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import Document from '$lib/components/icons/Document.svelte';
	import GarbageBin from '$lib/components/icons/GarbageBin.svelte';
	import Plus from '$lib/components/icons/Plus.svelte';

	// Voice id and the sample-audio files attached to it. File item shape varies
	
	

	// Called with the updated voice (voice+files) returned by add/remove endpoints
	
	interface Props {
		// by upload path, so accessed dynamically — same convention as KnowledgeBase.
		voiceId: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		files?: Record<string, any>[];
		// so the parent (VoiceDetail) can keep its `voice` in sync.
		onChange?: AnyFn;
	}

	let { voiceId, files = $bindable([]), onChange = () => {} }: Props = $props();

	let inputFiles: FileList | null = $state(null);
	let dragged = $state(false);

	// Sample audio is audio-only. Reject anything else with a clear message.
	const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|flac|aac|opus|weba|webm)$/i;
	const isAudioFile = (file: File) =>
		(file.type ?? '').startsWith('audio/') || AUDIO_EXT.test(file.name);

	// Files carry only user_id — resolve display names lazily, once per id.
	let userNames: Record<string, string> = $state({});
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const requestedUserIds = new Set<string>();

	const resolveUserName = async (userId: string) => {
		const name = await getUserById(localStorage.token, userId)
			.then((u) => u?.name ?? $i18n.t('Deleted User'))
			.catch(() => $i18n.t('Deleted User'));
		userNames = { ...userNames, [userId]: name };
	};

	$effect(() => {
		for (const file of files) {
			const userId = file.user_id;
			if (userId && !requestedUserIds.has(userId)) {
				requestedUserIds.add(userId);
				resolveUserName(userId);
			}
		}
	});

	const addFileHandler = async (fileId: string) => {
		const updatedVoice = await addFileToVoiceById(localStorage.token, voiceId, fileId).catch((e) => {
			toast.error(e);
			return null;
		});

		if (updatedVoice) {
			onChange(updatedVoice);
			toast.success($i18n.t('File added successfully.'));
		} else {
			toast.error($i18n.t('Failed to add file.'));
		}
	};

	const uploadFileHandler = async (file: File) => {
		if (!isAudioFile(file)) {
			toast.error($i18n.t('Only audio files can be added as voice samples.'));
			return;
		}

		if (file.size === 0) {
			toast.error($i18n.t('You cannot upload an empty file.'));
			return;
		}

		const tempItemId = uuidv4();
		const fileItem = {
			type: 'file',
			file: '',
			id: null,
			url: '',
			name: file.name,
			size: file.size,
			status: 'uploading',
			error: '',
			itemId: tempItemId
		};
		files = [...files, fileItem];

		try {
			const uploadedFile = await uploadFile(localStorage.token, file).catch((e) => {
				toast.error(e);
				return null;
			});

			if (uploadedFile) {
				await addFileHandler(uploadedFile.id);
			} else {
				toast.error($i18n.t('Failed to upload file.'));
				files = files.filter((item) => item.itemId !== tempItemId);
			}
		} catch (e) {
			toast.error((e as Error)?.message ?? String(e));
			files = files.filter((item) => item.itemId !== tempItemId);
		}
	};

	const deleteFileHandler = async (fileId: string) => {
		const updatedVoice = await removeFileFromVoiceById(localStorage.token, voiceId, fileId).catch(
			(e) => {
				toast.error(e);
				return null;
			}
		);

		if (updatedVoice) {
			onChange(updatedVoice);
			toast.success($i18n.t('File removed successfully.'));
		}
	};

	const onDragOver = (e: DragEvent) => {
		e.preventDefault();
		dragged = !!e.dataTransfer?.types?.includes('Files');
	};

	const onDragLeave = () => {
		dragged = false;
	};

	const onDrop = async (e: DragEvent) => {
		e.preventDefault();
		dragged = false;

		const dropped = e.dataTransfer?.files;
		if (dropped && dropped.length > 0) {
			for (const file of Array.from(dropped)) {
				await uploadFileHandler(file);
			}
		}
	};
</script>

<input
	id="voice-files-input"
	bind:files={inputFiles}
	type="file"
	accept="audio/*"
	multiple
	hidden
	onchange={async () => {
		if (inputFiles && inputFiles.length > 0) {
			for (const file of Array.from(inputFiles)) {
				await uploadFileHandler(file);
			}
			inputFiles = null;
			const el = document.getElementById('voice-files-input') as HTMLInputElement | null;
			if (el) el.value = '';
		} else {
			toast.error($i18n.t(`File not found.`));
		}
	}}
/>

<div class="flex flex-col gap-2 w-full h-full">
	<div class="flex items-center justify-between px-1">
		<div class="text-xs text-gray-500">
			{files.length}
			{files.length === 1 ? $i18n.t('sample') : $i18n.t('samples')}
		</div>
		<button
			type="button"
			class="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-gray-50 hover:bg-gray-100 dark:bg-gray-850 dark:hover:bg-gray-800 dark:text-gray-200 transition font-medium"
			onclick={() => {
				document.getElementById('voice-files-input')?.click();
			}}
		>
			<Plus className="size-3.5" />
			{$i18n.t('Add Audio')}
		</button>
	</div>

	<div
		class="flex-1 w-full max-h-full overflow-auto rounded-2xl border {dragged
			? 'border-gray-400 dark:border-gray-500'
			: 'border-gray-50 dark:border-gray-850'} transition"
		role="region"
		aria-label={$i18n.t('Voice samples')}
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		ondrop={onDrop}
	>
		{#if files.length > 0}
			<table
				class="w-full text-sm text-left text-gray-500 dark:text-gray-400 table-auto max-w-full rounded-lg"
			>
				<thead
					class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-850 dark:text-gray-400 sticky top-0 z-10"
				>
					<tr>
						<th scope="col" class="px-3 py-1.5">{$i18n.t('Name')}</th>
						<th scope="col" class="px-3 py-1.5">{$i18n.t('Size')}</th>
						<th scope="col" class="px-3 py-1.5">{$i18n.t('Uploaded')}</th>
						<th scope="col" class="px-3 py-1.5">{$i18n.t('Uploaded By')}</th>
						<th scope="col" class="px-3 py-1.5 text-right"></th>
					</tr>
				</thead>
				<tbody>
					{#each files as file (file.itemId ?? file.id)}
						<tr
							class="border-b border-gray-50 dark:border-gray-850 text-xs {file.status ===
							'uploading'
								? 'opacity-60'
								: ''}"
						>
							<td class="px-3 py-1.5 font-medium text-gray-900 dark:text-white max-w-xs">
								<div class="flex items-center gap-2">
									{#if file.status === 'uploading'}
										<Spinner className="size-3.5 shrink-0" />
									{:else}
										<Document className="size-3.5 shrink-0" />
									{/if}
									<Tooltip
										content={file?.name ?? file?.meta?.name}
										className="flex line-clamp-1"
										placement="top-start"
									>
										<span class="line-clamp-1">{file?.name ?? file?.meta?.name}</span>
									</Tooltip>
								</div>
							</td>
							<td class="px-3 py-1.5">
								{#if file?.size ?? file?.meta?.size}
									{formatFileSize(file?.size ?? file?.meta?.size)}
								{:else}
									—
								{/if}
							</td>
							<td class="px-3 py-1.5">
								{#if file.created_at}
									{dayjs(file.created_at * 1000).format('MMM D, YYYY HH:mm')}
								{:else}
									—
								{/if}
							</td>
							<td class="px-3 py-1.5">
								{#if file.user_id}
									{userNames[file.user_id] || '…'}
								{:else}
									—
								{/if}
							</td>
							<td class="px-3 py-1.5 text-right">
								<button
									type="button"
									class="p-1 dark:text-gray-300 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-lg"
									onclick={() => {
										if (file.status === 'uploading') return;
										deleteFileHandler(file.id);
									}}
								>
									<GarbageBin className="size-3.5" />
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<div class="flex flex-col items-center justify-center text-center py-12 gap-1 text-gray-500">
				<div class="text-sm">{$i18n.t('No voice samples yet.')}</div>
				<div class="text-xs">
					{$i18n.t('Drag & drop audio files here, or use Add Audio.')}
				</div>
			</div>
		{/if}
	</div>
</div>
