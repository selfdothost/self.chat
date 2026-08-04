<script lang="ts">
	import { stopPropagation } from 'svelte/legacy';

	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import dayjs from 'dayjs';
	import { getContext } from 'svelte';
	import type { AnyFn } from '$lib/types';
	const i18n: Writable<i18nType> = getContext('i18n');

	import { getUserById } from '$lib/apis/users';
	import { formatFileSize } from '$lib/utils';

	import Spinner from '$lib/components/common/Spinner.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import Document from '$lib/components/icons/Document.svelte';
	import GarbageBin from '$lib/components/icons/GarbageBin.svelte';

	// File item shape varies by upload path (direct upload, URL scrape,
	// Google Drive, ...) — accessed dynamically rather than through one
	
	interface Props {
		// consistent interface, same as the rest of the KnowledgeBase tree.
		/* eslint-disable @typescript-eslint/no-explicit-any */
		files?: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
		onOpen?: AnyFn;
		onDelete?: AnyFn;
	}

	let { files = [], onOpen = () => {}, onDelete = () => {} }: Props = $props();

	// Files carry only user_id — resolve display names lazily, once per id,
	// via the existing per-user endpoint (no bulk-lookup API exists).
	let userNames: Record<string, string> = $state({});
	// A "seen before" dedup guard, mutated in place -- never read by the
	// template or triggers a re-render itself; the actual reactive state
	// (userNames) is updated separately via reassignment in resolveUserName.
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
</script>

<div class="scrollbar-hidden relative whitespace-nowrap overflow-x-auto max-w-full h-full rounded-lg">
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
					class="border-b border-gray-50 dark:border-gray-850 text-xs hover:bg-gray-50 dark:hover:bg-gray-850 transition cursor-pointer {file.status ===
					'uploading'
						? 'opacity-60'
						: ''}"
					ondblclick={() => {
						if (file.status === 'uploading' && file.id !== null) {
							return;
						}
						onOpen(file.id);
					}}
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
							onclick={stopPropagation(() => {
								if (file.status === 'uploading') return;
								onDelete(file.id);
							})}
						>
							<GarbageBin className="size-3.5" />
						</button>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
