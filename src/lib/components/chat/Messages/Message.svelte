<script lang="ts">

	import { settings } from '$lib/stores';

	import MultiResponseMessages from './MultiResponseMessages.svelte';
	import ResponseMessage from './ResponseMessage.svelte';
	import UserMessage from './UserMessage.svelte';


	// Chat history tree: message nodes keyed by id, each shaped differently
	// depending on role (user/assistant) -- read positionally throughout this
	// component, not through one fixed interface.
	





	interface Props {
		/* eslint-disable @typescript-eslint/no-explicit-any */
		chatId: any;
		idx?: number;
		 
		history: { messages: Record<string, any>; currentId?: string };
		messageId: any;
		user: any;
		showPreviousMessage: any;
		showNextMessage: any;
		updateChat: any;
		editMessage: any;
		saveMessage: any;
		deleteMessage: any;
		rateMessage: any;
		actionMessage: any;
		submitMessage: any;
		regenerateResponse: any;
		continueResponse: any;
		mergeResponses: any;
		addMessages: any;
		triggerScroll: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
		readOnly?: boolean;
	}

	let {
		chatId,
		idx = 0,
		history = $bindable(),
		messageId,
		user,
		showPreviousMessage,
		showNextMessage,
		updateChat,
		editMessage,
		saveMessage,
		deleteMessage,
		rateMessage,
		actionMessage,
		submitMessage,
		regenerateResponse,
		continueResponse,
		mergeResponses,
		addMessages,
		triggerScroll,
		readOnly = false
	}: Props = $props();
</script>

<div
	class="flex flex-col justify-between px-5 mb-3 w-full {($settings?.widescreenMode ?? null)
		? 'max-w-full'
		: 'max-w-5xl'} mx-auto rounded-lg group"
>
	{#if history.messages[messageId]}
		{#if history.messages[messageId].role === 'user'}
			<UserMessage
				{user}
				{history}
				{messageId}
				isFirstMessage={idx === 0}
				siblings={history.messages[messageId].parentId !== null
					? (history.messages[history.messages[messageId].parentId]?.childrenIds ?? [])
					: (Object.values(history.messages)
							.filter((message) => message.parentId === null)
							.map((message) => message.id) ?? [])}
				{showPreviousMessage}
				{showNextMessage}
				{editMessage}
				{deleteMessage}
				{readOnly}
			/>
		{:else if (history.messages[history.messages[messageId].parentId]?.models?.length ?? 1) === 1}
			<ResponseMessage
				{chatId}
				{history}
				{messageId}
				isLastMessage={messageId === history.currentId}
				siblings={history.messages[history.messages[messageId].parentId]?.childrenIds ?? []}
				{showPreviousMessage}
				{showNextMessage}
				{updateChat}
				{editMessage}
				{saveMessage}
				{rateMessage}
				{actionMessage}
				{submitMessage}
				{continueResponse}
				{regenerateResponse}
				{addMessages}
				{readOnly}
			/>
		{:else}
			<MultiResponseMessages
				bind:history
				{chatId}
				{messageId}
				isLastMessage={messageId === history?.currentId}
				{updateChat}
				{editMessage}
				{saveMessage}
				{rateMessage}
				{actionMessage}
				{submitMessage}
				{continueResponse}
				{regenerateResponse}
				{mergeResponses}
				{triggerScroll}
				{addMessages}
				{readOnly}
			/>
		{/if}
	{/if}
</div>
