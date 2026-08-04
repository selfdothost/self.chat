<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import { getContext } from 'svelte';
	const i18n: Writable<i18nType> = getContext('i18n');

	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import SensitiveInput from '$lib/components/common/SensitiveInput.svelte';
	import Cog6 from '$lib/components/icons/Cog6.svelte';
	import AddConnectionModal from './AddConnectionModal.svelte';


	// Unlike OpenAIConnection there is no sibling `key` prop: the Anthropic key lives
	// inside the per-URL config bag, so there is no parallel keys array to keep in
	// index-lockstep with the URLs (self.ai#59).
	
	interface Props {
		onDelete?: AnyFn;
		onSubmit?: AnyFn;
		url?: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		config?: Record<string, any>;
	}

	let {
		onDelete = () => {},
		onSubmit = () => {},
		url = $bindable(''),
		config = $bindable({})
	}: Props = $props();

	let showConfigModal = $state(false);
</script>

<AddConnectionModal
	edit
	type="anthropic"
	bind:show={showConfigModal}
	connection={{
		url,
		key: config?.key ?? '',
		config
	}}
	{onDelete}
	onSubmit={(connection) => {
		url = connection.url;
		// Fold the key back into the config bag -- the modal always hands it back as a
		// sibling field because that shape is shared with the OpenAI-style providers.
		config = { ...connection.config, key: connection.key };
		onSubmit({ url: connection.url, config });
	}}
/>

<div class="flex w-full gap-2 items-center">
	<Tooltip
		className="w-full relative"
		content={$i18n.t(`WebUI will make requests to "{{url}}/v1/messages"`, {
			url
		})}
		placement="top-start"
	>
		{#if !(config?.enable ?? true)}
			<div
				class="absolute top-0 bottom-0 left-0 right-0 opacity-60 bg-white dark:bg-gray-900 z-10"
			></div>
		{/if}
		<div class="flex w-full">
			<div class="flex-1 relative">
				<input
					class=" outline-none w-full bg-transparent"
					placeholder={$i18n.t('API Base URL')}
					bind:value={url}
					autocomplete="off"
				/>
			</div>

			<SensitiveInput
				inputClassName=" outline-none bg-transparent w-full"
				placeholder={$i18n.t('API Key')}
				bind:value={config.key}
			/>
		</div>
	</Tooltip>

	<div class="flex gap-1">
		<Tooltip content={$i18n.t('Configure')} className="self-start">
			<button
				class="self-center p-1 bg-transparent hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-850 rounded-lg transition"
				onclick={() => {
					showConfigModal = true;
				}}
				type="button"
			>
				<Cog6 />
			</button>
		</Tooltip>
	</div>
</div>
