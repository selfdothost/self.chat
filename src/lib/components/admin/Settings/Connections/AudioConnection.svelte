<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import { getContext } from 'svelte';
	import type { AudioConnection, AudioConnectionType } from '$lib/apis/audio';

	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import Cog6 from '$lib/components/icons/Cog6.svelte';
	import AudioConnectionModal from './AudioConnectionModal.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	export let connection: AudioConnection;
	export let types: AudioConnectionType[] = [];

	export let onSubmit: AnyFn = () => {};
	export let onDelete: AnyFn = () => {};

	let showConfigModal = false;

	// The most identifying field value, for an at-a-glance summary line. Secret
	// values arrive masked, so nothing sensitive is shown here.
	$: summary = Object.entries(connection.fields ?? {})
		.map(([k, v]) => `${k}=${v}`)
		.join('  ');
</script>

<AudioConnectionModal
	edit
	bind:show={showConfigModal}
	{types}
	{connection}
	{onSubmit}
	{onDelete}
/>

<div class="flex w-full gap-2 items-center">
	<div class="flex-1 min-w-0">
		<div class="text-sm truncate">{connection.label}</div>
		<div class="text-xs text-gray-500 truncate">
			{#if summary}
				{summary}
			{:else}
				{$i18n.t('No fields configured')}
			{/if}
		</div>
	</div>

	{#if connection.management_action}
		<Tooltip content={connection.management_action.label}>
			<span
				class="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-850 text-gray-500 whitespace-nowrap"
			>
				{$i18n.t('self-hosted')}
			</span>
		</Tooltip>
	{/if}

	<Tooltip content={$i18n.t('Configure')}>
		<button
			class="self-center p-1 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
			on:click={() => {
				showConfigModal = true;
			}}
			type="button"
			aria-label={$i18n.t('Configure')}
		>
			<Cog6 />
		</button>
	</Tooltip>
</div>
