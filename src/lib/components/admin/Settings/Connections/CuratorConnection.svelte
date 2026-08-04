<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import { getContext } from 'svelte';
	const i18n: Writable<i18nType> = getContext('i18n');

	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import AddConnectionModal from './AddConnectionModal.svelte';

	import Cog6 from '$lib/components/icons/Cog6.svelte';


	// Per-connection config bag (key/enable/etc.) -- shape varies with the
	// connection type, mirrors AddConnectionModal's own loose `connection.config`.
	
	interface Props {
		onDelete?: AnyFn;
		onSubmit?: AnyFn;
		url?: string;
		idx?: number;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		config?: Record<string, any>;
	}

	// `idx` accepted (parent passes it for list-key/removal purposes) but not
	// read internally by this component.
	let {
		onDelete = () => {},
		onSubmit = () => {},
		url = $bindable(''),
		config = $bindable({})
	}: Props = $props();

	let showConfigModal = $state(false);
</script>

<AddConnectionModal
	type="curator"
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

<div class="flex gap-1.5">
	<Tooltip
		className="w-full relative"
		content={$i18n.t(`WebUI will make requests to "{{url}}/health"`, {
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
			placeholder={$i18n.t('Enter URL (e.g. http://self-curator:8094)')}
			bind:value={url}
		/>
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
