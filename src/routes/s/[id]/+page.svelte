<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { tick, getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';

	import dayjs from 'dayjs';

	import { chatId, WEBUI_NAME, models } from '$lib/stores';
	import { convertMessagesToHistory, createMessagesList } from '$lib/utils';

	import { getChatByShareId, cloneSharedChatById } from '$lib/apis/chats';

	import Messages from '$lib/components/chat/Messages.svelte';

	import { getUserById } from '$lib/apis/users';
	import { getModels } from '$lib/apis';
	import { toast } from 'svelte-sonner';

	const i18n: Writable<i18nType> = getContext('i18n');

	let loaded = $state(false);

	let autoScroll = $state(true);

	// let chatId = $page.params.id;
	let selectedModels = $state(['']);

	let chat = $state(null);
	let user = $state(null);

	let title = $state('');
	let files = [];

	let history = $state({
		messages: {},
		currentId: null
	});
	let messages = $derived(createMessagesList(history, history.currentId));
	// This is a read-only shared-chat view (no composer) -- bind:prompt just
	// needs a target, and mergeResponses/chatActionHandler are never invoked
	// since there's no message-editing/action UI here.
	let prompt = $state('');


	 

	//////////////////////////
	// Web functions
	//////////////////////////

	const loadSharedChat = async () => {
		await models.set(await getModels(localStorage.token));
		await chatId.set($page.params.id);
		chat = await getChatByShareId(localStorage.token, $chatId).catch(async (_error) => {
			await goto(resolve('/'));
			return null;
		});

		if (chat) {
			user = await getUserById(localStorage.token, chat.user_id).catch((error) => {
				console.error(error);
				return null;
			});

			const chatContent = chat.chat;

			if (chatContent) {
				console.log(chatContent);

				selectedModels =
					(chatContent?.models ?? undefined) !== undefined
						? chatContent.models
						: [chatContent.models ?? ''];
				history =
					(chatContent?.history ?? undefined) !== undefined
						? chatContent.history
						: convertMessagesToHistory(chatContent.messages);
				title = chatContent.title;

				autoScroll = true;
				await tick();

				if (messages.length > 0) {
					history.messages[messages.at(-1).id].done = true;
				}
				await tick();

				return true;
			} else {
				return null;
			}
		}
	};

	const cloneSharedChat = async () => {
		if (!chat) return;

		const res = await cloneSharedChatById(localStorage.token, chat.id).catch((error) => {
			toast.error(error);
			return null;
		});

		if (res) {
			goto(resolve('/(app)/c/[id]', { id: res.id }));
		}
	};
	$effect(() => {
		if ($page.params.id) {
			(async () => {
				if (await loadSharedChat()) {
					await tick();
					loaded = true;
				} else {
					await goto(resolve('/'));
				}
			})();
		}
	});
</script>

<svelte:head>
	<title>
		{title
			? `${title.length > 30 ? `${title.slice(0, 30)}...` : title} | ${$WEBUI_NAME}`
			: `${$WEBUI_NAME}`}
	</title>
</svelte:head>

{#if loaded}
	<div
		class="min-h-screen max-h-screen w-full flex flex-col text-gray-700 dark:text-gray-100 bg-white dark:bg-gray-900"
	>
		<div class="flex flex-col flex-auto justify-center relative">
			<div class=" flex flex-col w-full flex-auto overflow-auto h-0" id="messages-container">
				<div class="pt-5 px-2 w-full max-w-5xl mx-auto">
					<div class="px-3">
						<div class=" text-2xl font-semibold line-clamp-1">
							{title}
						</div>

						<div class="flex text-sm justify-between items-center mt-1">
							<div class="text-gray-400">
								{dayjs(chat.chat.timestamp).format($i18n.t('MMMM DD, YYYY'))}
							</div>
						</div>
					</div>
				</div>

				<div class=" h-full w-full flex flex-col py-2">
					<div class="">
						<Messages
							className="h-full flex pt-4 pb-8"
							{user}
							chatId={$chatId}
							readOnly={true}
							{selectedModels}
							bind:prompt
							bind:history
							bind:autoScroll
							bottomPadding={files.length > 0}
							sendPrompt={() => {}}
							continueResponse={() => {}}
							regenerateResponse={() => {}}
							mergeResponses={() => {}}
							chatActionHandler={() => {}}
						/>
					</div>
				</div>
			</div>

			<div
				class="absolute bottom-0 right-0 left-0 flex justify-center w-full bg-linear-to-b from-transparent to-gray-900"
			>
				<div class="pb-5">
					<button
						class="px-4 py-2 text-sm font-medium bg-black hover:bg-gray-900 text-white dark:bg-white dark:text-black dark:hover:bg-gray-100 transition rounded-full"
						onclick={cloneSharedChat}
					>
						{$i18n.t('Clone Chat')}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
