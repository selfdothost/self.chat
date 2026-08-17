<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import { toast } from 'svelte-sonner';
	import { marked } from 'marked';

	import { onMount, getContext, tick } from 'svelte';
	import { fade } from 'svelte/transition';

	import { config, user, models as _models, temporaryChatEnabled } from '$lib/stores';
	import type { Model } from '$lib/stores';
	import { sanitizeResponseContent } from '$lib/utils';
	import { WEBUI_BASE_URL } from '$lib/constants';

	import Suggestions from './Suggestions.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import EyeSlash from '$lib/components/icons/EyeSlash.svelte';
	import MessageInput from './MessageInput.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');







	interface Props {
		transparentBackground?: boolean;
		createMessagePair: AnyFn;
		stopResponse: AnyFn;
		autoScroll?: boolean;
		atSelectedModel: Model | undefined;
		selectedModels: string[];
		/* eslint-disable @typescript-eslint/no-explicit-any */
		history: any;
		prompt?: string;
		files?: any;
		selectedToolIds?: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
		webSearchEnabled?: boolean;
		deepResearchEnabled?: boolean;
		webCrawlEnabled?: boolean;
		webCrawlKbId?: string;
		onUpload?: AnyFn;
		onSubmit?: AnyFn;
		/** Passed straight through to the composer. Omitted means nothing extra is
		 *  rendered — today's behaviour. Forwarded, never read: this component
		 *  does not know or care what the accessory is for. */
		composerAccessory?: import('svelte').Snippet<[{ insertText: (text: string) => void }]>;
	}

	let {
		transparentBackground = false,
		createMessagePair,
		stopResponse,
		autoScroll = $bindable(false),
		atSelectedModel = $bindable(),
		selectedModels,
		history,
		prompt = $bindable(''),
		files = $bindable([]),
		selectedToolIds = $bindable([]),
		webSearchEnabled = $bindable(false),
		deepResearchEnabled = $bindable(false),
		webCrawlEnabled = $bindable(false),
		webCrawlKbId = $bindable(''),
		onUpload = () => {},
		onSubmit = () => {},
		composerAccessory = undefined
	}: Props = $props();

	let models = $derived(selectedModels.map((id) => $_models.find((m) => m.id === id)));

	const selectSuggestionPrompt = async (p) => {
		let text = p;

		if (p.includes('{{CLIPBOARD}}')) {
			const clipboardText = await navigator.clipboard.readText().catch((_err) => {
				toast.error($i18n.t('Failed to read clipboard contents'));
				return '{{CLIPBOARD}}';
			});

			text = p.replaceAll('{{CLIPBOARD}}', clipboardText);

			console.log('Clipboard text:', clipboardText, text);
		}

		prompt = text;

		console.log(prompt);
		await tick();

		const chatInputContainerElement = document.getElementById('chat-input-container');
		const chatInputElement = document.getElementById('chat-input');

		if (chatInputContainerElement) {
			chatInputContainerElement.style.height = '';
			chatInputContainerElement.style.height =
				Math.min(chatInputContainerElement.scrollHeight, 200) + 'px';
		}

		await tick();
		if (chatInputElement) {
			chatInputElement.focus();
			chatInputElement.dispatchEvent(new Event('input'));
		}

		await tick();
	};

	let selectedModelIdx = $state(0);

	$effect(() => {
		if (selectedModels.length > 0) {
			selectedModelIdx = models.length - 1;
		}
	});

	onMount(() => {});
</script>

<div class="m-auto w-full max-w-6xl px-2 xl:px-20 translate-y-6 py-24 text-center">
	{#if $temporaryChatEnabled}
		<Tooltip
			content="This chat won't appear in history and your messages will not be saved."
			className="w-full flex justify-center mb-0.5"
			placement="top"
		>
			<div class="flex items-center gap-2 text-gray-500 font-medium text-lg my-2 w-fit">
				<EyeSlash strokeWidth="2.5" className="size-5" /> Temporary Chat
			</div>
		</Tooltip>
	{/if}

	<div
		class="w-full text-3xl text-gray-800 dark:text-gray-100 font-medium text-center flex items-center gap-4 font-primary"
	>
		<div class="w-full flex flex-col justify-center items-center">
			<div class="flex flex-row justify-center gap-3 sm:gap-3.5 w-fit px-5">
				<div class="flex shrink-0 justify-center">
					<div class="flex -space-x-4 mb-0.5" in:fade={{ duration: 100 }}>
						<!-- compare mode lets the user pick the same model into more than one slot; index is the only stable disambiguator -->
						{#each models as model, modelIdx (modelIdx)}
							<Tooltip
								content={(models[modelIdx]?.info?.meta?.tags ?? [])
									.map((tag) => tag.name.toUpperCase())
									.join(', ')}
								placement="top"
							>
								<button
									onclick={() => {
										selectedModelIdx = modelIdx;
									}}
								>
									<img
										crossorigin="anonymous"
										src={model?.info?.meta?.profile_image_url ??
											($i18n.language === 'dg-DG'
												? `/doge.png`
												: `${WEBUI_BASE_URL}/static/favicon.png`)}
										class=" size-9 sm:size-10 rounded-full border-[1px] border-gray-200 dark:border-none"
										alt="logo"
										draggable="false"
									/>
								</button>
							</Tooltip>
						{/each}
					</div>
				</div>

				<div class=" text-3xl sm:text-4xl line-clamp-1" in:fade={{ duration: 100 }}>
					{#if models[selectedModelIdx]?.name}
						{models[selectedModelIdx]?.name}
					{:else}
						{$i18n.t('Hello, {{name}}', { name: $user.name })}
					{/if}
				</div>
			</div>

			<div class="flex mt-1 mb-2">
				<div in:fade={{ duration: 100, delay: 50 }}>
					{#if models[selectedModelIdx]?.info?.meta?.description ?? null}
						<Tooltip
							className=" w-fit"
							content={marked.parse(
								sanitizeResponseContent(models[selectedModelIdx]?.info?.meta?.description ?? ''),
								{ async: false }
							)}
							placement="top"
						>
							<div
								class="mt-0.5 px-2 text-sm font-normal text-gray-500 dark:text-gray-400 line-clamp-2 max-w-xl markdown"
							>
								<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitizeResponseContent() (src/lib/utils/index.ts) HTML-entity-escapes < and > before this reaches marked.parse() -->
								{@html marked.parse(
									sanitizeResponseContent(models[selectedModelIdx]?.info?.meta?.description)
								)}
							</div>
						</Tooltip>

						{#if models[selectedModelIdx]?.info?.meta?.user}
							<div class="mt-0.5 text-sm font-normal text-gray-400 dark:text-gray-500">
								By
								{#if models[selectedModelIdx]?.info?.meta?.user.community}
									<a
										href="https://selfai.com/m/{models[selectedModelIdx]?.info?.meta?.user
											.username}"
										>{models[selectedModelIdx]?.info?.meta?.user.name
											? models[selectedModelIdx]?.info?.meta?.user.name
											: `@${models[selectedModelIdx]?.info?.meta?.user.username}`}</a
									>
								{:else}
									{models[selectedModelIdx]?.info?.meta?.user.name}
								{/if}
							</div>
						{/if}
					{/if}
				</div>
			</div>

			<div
				class="text-base font-normal xl:translate-x-6 md:max-w-3xl w-full py-3 {atSelectedModel
					? 'mt-2'
					: ''}"
			>
				<MessageInput
					{history}
					{selectedModels}
					bind:files
					bind:prompt
					bind:autoScroll
					bind:selectedToolIds
					bind:webSearchEnabled
					bind:deepResearchEnabled
					bind:webCrawlEnabled
					bind:webCrawlKbId
					bind:atSelectedModel
					{transparentBackground}
					{composerAccessory}
					{stopResponse}
					{createMessagePair}
					placeholder={$i18n.t('How can I help you today?')}
					{onUpload}
					{onSubmit}
				/>
			</div>
		</div>
	</div>
	<div class="mx-auto max-w-2xl font-primary" in:fade={{ duration: 200, delay: 200 }}>
		<div class="mx-5">
			<Suggestions
				suggestionPrompts={models[selectedModelIdx]?.info?.meta?.suggestion_prompts ??
					$config?.default_prompt_suggestions ??
					[]}
				onSelect={(detail) => {
					selectSuggestionPrompt(detail);
				}}
			/>
		</div>
	</div>
</div>
