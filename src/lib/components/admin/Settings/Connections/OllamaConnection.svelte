<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import { getContext } from 'svelte';
	const i18n: Writable<i18nType> = getContext('i18n');

	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import AddConnectionModal from './AddConnectionModal.svelte';

	import Cog6 from '$lib/components/icons/Cog6.svelte';
	import Wrench from '$lib/components/icons/Wrench.svelte';
	import ManageOllamaModal from './ManageOllamaModal.svelte';

	// Called with the updated connection object from AddConnectionModal's
	// onSubmit handler below -- a bare `() => {}` (0-arg) type doesn't match
	

	// Config bag round-tripped through AddConnectionModal, which also reads
	// generic fields (prefix_id, model_ids, ...) off it for any connection
	// type -- only `key`/`enable` are read directly in this file.
	
	interface Props {
		/* eslint-disable @typescript-eslint/no-explicit-any */
		onDelete?: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
		// that call.
		onSubmit?: AnyFn;
		url?: string;
		idx?: number;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		config?: { key?: string; enable?: boolean; [key: string]: any };
	}

	let {
		onDelete = () => {},
		onSubmit = () => {},
		url = $bindable(''),
		idx = 0,
		config = $bindable({})
	}: Props = $props();

	let showManageModal = $state(false);
	let showConfigModal = $state(false);
</script>

<AddConnectionModal
	type="ollama"
	edit
	bind:show={showConfigModal}
	connection={{
		url,
		key: config?.key ?? '',
		config: config
	}}
	{onDelete}
	onSubmit={(connection) => {
		url = connection.url;
		config = { ...connection.config, key: connection.key };
		onSubmit(connection);
	}}
/>

<ManageOllamaModal bind:show={showManageModal} urlIdx={idx} />

<div class="flex gap-1.5">
	<Tooltip
		className="w-full relative"
		content={$i18n.t(`WebUI will make requests to "{{url}}/api/chat"`, {
			url
		})}
		placement="top-start"
	>
		{#if !(config?.enable ?? true)}
			<div
				class="absolute top-0 bottom-0 left-0 right-0 opacity-60 bg-white dark:bg-gray-900 z-10"
			></div>
		{/if}

		<input
			class="w-full text-sm bg-transparent outline-hidden"
			placeholder={$i18n.t('Enter URL (e.g. http://localhost:11434)')}
			bind:value={url}
		/>
	</Tooltip>

	<div class="flex gap-1">
		<Tooltip content={$i18n.t('Manage')} className="self-start">
			<button
				class="self-center p-1 bg-transparent hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-850 rounded-lg transition"
				onclick={() => {
					showManageModal = true;
				}}
				type="button"
			>
				<Wrench />
			</button>
		</Tooltip>

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
