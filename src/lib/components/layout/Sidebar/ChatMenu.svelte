<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import { DropdownMenu } from 'bits-ui';
	import DropdownMenuContent from '$lib/components/common/DropdownMenuContent.svelte';
	import DropdownMenuSubContent from '$lib/components/common/DropdownMenuSubContent.svelte';
	import { getContext } from 'svelte';

	import fileSaver from 'file-saver';
	const { saveAs } = fileSaver;


	import Dropdown from '$lib/components/common/Dropdown.svelte';
	import GarbageBin from '$lib/components/icons/GarbageBin.svelte';
	import Pencil from '$lib/components/icons/Pencil.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import Tags from '$lib/components/chat/Tags.svelte';
	import Share from '$lib/components/icons/Share.svelte';
	import ArchiveBox from '$lib/components/icons/ArchiveBox.svelte';
	import DocumentDuplicate from '$lib/components/icons/DocumentDuplicate.svelte';
	import Bookmark from '$lib/components/icons/Bookmark.svelte';
	import BookmarkSlash from '$lib/components/icons/BookmarkSlash.svelte';
	import {
		getChatById,
		getChatPinnedStatusById,
		toggleChatPinnedStatusById
	} from '$lib/apis/chats';
	import { createMessagesList } from '$lib/utils';
	import { downloadChatAsPDF } from '$lib/apis/utils';
	import Download from '$lib/components/icons/Download.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');


	interface Props {
		shareHandler: AnyFn;
		cloneChatHandler: AnyFn;
		archiveChatHandler: AnyFn;
		renameHandler: AnyFn;
		deleteHandler: AnyFn;
		onClose: AnyFn;
		chatId?: string;
		// onChange: the chat list must re-fetch (archive/clone/delete happened).
		// onTag: { type: 'add' | 'delete', name } -- ChatItem forwards it verbatim.
		onChange?: AnyFn;
		onTag?: AnyFn;
		children?: import('svelte').Snippet;
	}

	let {
		shareHandler,
		cloneChatHandler,
		archiveChatHandler,
		renameHandler,
		deleteHandler,
		onClose,
		chatId = '',
		onChange = () => {},
		onTag = () => {},
		children
	}: Props = $props();

	let show = $state(false);
	let pinned = $state(false);

	const pinHandler = async () => {
		await toggleChatPinnedStatusById(localStorage.token, chatId);
		onChange();
	};

	const checkPinned = async () => {
		pinned = await getChatPinnedStatusById(localStorage.token, chatId);
	};

	const getChatAsText = async (chat) => {
		const history = chat.chat.history;
		const messages = createMessagesList(history, history.currentId);
		const chatText = messages.reduce((a, message, _i, _arr) => {
			return `${a}### ${message.role.toUpperCase()}\n${message.content}\n\n`;
		}, '');

		return chatText.trim();
	};

	const downloadTxt = async () => {
		const chat = await getChatById(localStorage.token, chatId);
		if (!chat) {
			return;
		}

		const chatText = await getChatAsText(chat);
		let blob = new Blob([chatText], {
			type: 'text/plain'
		});

		saveAs(blob, `chat-${chat.chat.title}.txt`);
	};

	const downloadPdf = async () => {
		const chat = await getChatById(localStorage.token, chatId);
		if (!chat) {
			return;
		}

		const history = chat.chat.history;
		const messages = createMessagesList(history, history.currentId);
		const blob = await downloadChatAsPDF(chat.chat.title, messages);

		// Create a URL for the blob
		const url = window.URL.createObjectURL(blob);

		// Create a link element to trigger the download
		const a = document.createElement('a');
		a.href = url;
		a.download = `chat-${chat.chat.title}.pdf`;

		// Append the link to the body and click it programmatically
		document.body.appendChild(a);
		a.click();

		// Remove the link from the body
		document.body.removeChild(a);

		// Revoke the URL to release memory
		window.URL.revokeObjectURL(url);
	};

	const downloadJSONExport = async () => {
		const chat = await getChatById(localStorage.token, chatId);

		if (chat) {
			let blob = new Blob([JSON.stringify([chat])], {
				type: 'application/json'
			});
			saveAs(blob, `chat-export-${Date.now()}.json`);
		}
	};

	$effect(() => {
		if (show) {
			checkPinned();
		}
	});
</script>

<Dropdown
	bind:show
	onChange={(open) => {
		if (open === false) {
			onClose();
		}
	}}
>
	<Tooltip content={$i18n.t('More')}>
		{@render children?.()}
	</Tooltip>

	{#snippet content()}
		<div >
			<DropdownMenuContent
				class="w-full max-w-[200px] rounded-xl px-1 py-1.5 z-50 bg-white dark:bg-gray-850 dark:text-white shadow-lg"
				sideOffset={-2}
				side="bottom"
				align="start"
			>
				<DropdownMenu.Item
					class="flex gap-2 items-center px-3 py-1.5 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
					onSelect={() => {
						pinHandler();
					}}
				>
					{#if pinned}
						<BookmarkSlash strokeWidth="2" />
						<div class="flex items-center">{$i18n.t('Unpin')}</div>
					{:else}
						<Bookmark strokeWidth="2" />
						<div class="flex items-center">{$i18n.t('Pin')}</div>
					{/if}
				</DropdownMenu.Item>

				<DropdownMenu.Item
					class="flex gap-2 items-center px-3 py-1.5 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
					onSelect={() => {
						renameHandler();
					}}
				>
					<Pencil strokeWidth="2" />
					<div class="flex items-center">{$i18n.t('Rename')}</div>
				</DropdownMenu.Item>

				<DropdownMenu.Item
					class="flex gap-2 items-center px-3 py-1.5 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
					onSelect={() => {
						cloneChatHandler();
					}}
				>
					<DocumentDuplicate strokeWidth="2" />
					<div class="flex items-center">{$i18n.t('Clone')}</div>
				</DropdownMenu.Item>

				<DropdownMenu.Item
					class="flex gap-2 items-center px-3 py-1.5 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
					onSelect={() => {
						archiveChatHandler();
					}}
				>
					<ArchiveBox strokeWidth="2" />
					<div class="flex items-center">{$i18n.t('Archive')}</div>
				</DropdownMenu.Item>

				<DropdownMenu.Item
					class="flex gap-2 items-center px-3 py-1.5 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800  rounded-md"
					onSelect={() => {
						shareHandler();
					}}
				>
					<Share />
					<div class="flex items-center">{$i18n.t('Share')}</div>
				</DropdownMenu.Item>

				<DropdownMenu.Sub>
					<DropdownMenu.SubTrigger
						class="flex gap-2 items-center px-3 py-2 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
					>
						<Download strokeWidth="2" />

						<div class="flex items-center">{$i18n.t('Download')}</div>
					</DropdownMenu.SubTrigger>
					<DropdownMenuSubContent
						class="w-full rounded-xl px-1 py-1.5 z-50 bg-white dark:bg-gray-850 dark:text-white shadow-lg"
						sideOffset={8}
					>
						<DropdownMenu.Item
							class="flex gap-2 items-center px-3 py-2 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
							onSelect={() => {
								downloadJSONExport();
							}}
						>
							<div class="flex items-center line-clamp-1">{$i18n.t('Export chat (.json)')}</div>
						</DropdownMenu.Item>
						<DropdownMenu.Item
							class="flex gap-2 items-center px-3 py-2 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
							onSelect={() => {
								downloadTxt();
							}}
						>
							<div class="flex items-center line-clamp-1">{$i18n.t('Plain text (.txt)')}</div>
						</DropdownMenu.Item>

						<DropdownMenu.Item
							class="flex gap-2 items-center px-3 py-2 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
							onSelect={() => {
								downloadPdf();
							}}
						>
							<div class="flex items-center line-clamp-1">{$i18n.t('PDF document (.pdf)')}</div>
						</DropdownMenu.Item>
					</DropdownMenuSubContent>
				</DropdownMenu.Sub>
				<DropdownMenu.Item
					class="flex  gap-2  items-center px-3 py-1.5 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
					onSelect={() => {
						deleteHandler();
					}}
				>
					<GarbageBin strokeWidth="2" />
					<div class="flex items-center">{$i18n.t('Delete')}</div>
				</DropdownMenu.Item>

				<hr class="border-gray-50 dark:border-gray-850 my-0.5" />

				<div class="flex p-1">
					<!-- There was an `on:close` here too. chat/Tags never dispatched `close`,
					     so it could not fire and is dropped rather than carried across as a
					     prop nothing calls. Closing on add/delete below is the real behaviour. -->
					<Tags
						{chatId}
						onAdd={(tag) => {
							onTag({
								type: 'add',
								name: tag.name
							});

							show = false;
						}}
						onDelete={(tag) => {
							onTag({
								type: 'delete',
								name: tag.name
							});

							show = false;
						}}
					/>
				</div>
			</DropdownMenuContent>
		</div>
	{/snippet}
</Dropdown>
