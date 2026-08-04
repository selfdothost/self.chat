<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { getContext } from 'svelte';
	import ArcGauge from './ArcGauge.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	interface Props {
		/* eslint-disable @typescript-eslint/no-explicit-any */
		memory: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
		onViewProcesses: (sortBy: string) => void;
	}

	let { memory, onViewProcesses }: Props = $props();

	function formatMb(mb) {
		if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
		return `${Math.round(mb)} MB`;
	}
</script>

<div class="bg-gray-50 dark:bg-gray-900 rounded-2xl p-4 flex flex-col items-center gap-2">
	<div class="text-sm font-medium text-gray-700 dark:text-gray-300">
		{$i18n.t('System Memory')}
	</div>

	<ArcGauge
		percent={memory.percent}
		label="{formatMb(memory.used_mb)} / {formatMb(memory.total_mb)}"
	/>

	<button
		class="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition"
		onclick={() => onViewProcesses('memory_mb')}
	>
		{$i18n.t('View Processes')} &rarr;
	</button>
</div>
