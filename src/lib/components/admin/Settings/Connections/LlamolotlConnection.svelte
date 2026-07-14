<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import { getContext } from 'svelte';
	const i18n: Writable<i18nType> = getContext('i18n');

	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import AddConnectionModal from './AddConnectionModal.svelte';
	import ManageLlamolotlModal from './ManageLlamolotlModal.svelte';

	import Cog6 from '$lib/components/icons/Cog6.svelte';
	import Wrench from '$lib/components/icons/Wrench.svelte';

	export let onDelete: AnyFn = () => {};
	export let onSubmit: AnyFn = () => {};

	export let url = '';
	export let idx = 0;
	// Open-ended connection config bag (key, enable, and whatever else the
	// backend's connection record carries) -- genuinely dynamic, not a fixed shape.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export let config: Record<string, any> = {};

	let showManageModal = false;
	let showConfigModal = false;
</script>

<AddConnectionModal
	llamolotl
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

<ManageLlamolotlModal bind:show={showManageModal} urlIdx={idx} />

<div class="flex gap-1.5">
	<Tooltip
		className="w-full relative"
		content={$i18n.t(`WebUI will make requests to "{{url}}/v1/chat/completions"`, {
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
			class="w-full text-sm bg-transparent outline-none"
			placeholder={$i18n.t('Enter URL (e.g. http://localhost:8080)')}
			bind:value={url}
		/>
	</Tooltip>

	<div class="flex gap-1">
		<Tooltip content={$i18n.t('Manage')} className="self-start">
			<button
				class="self-center p-1 bg-transparent hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-850 rounded-lg transition"
				on:click={() => {
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
				on:click={() => {
					showConfigModal = true;
				}}
				type="button"
			>
				<Cog6 />
			</button>
		</Tooltip>
	</div>
</div>
