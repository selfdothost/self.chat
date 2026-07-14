<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { getContext } from 'svelte';
	const i18n: Writable<i18nType> = getContext('i18n');

	import panzoom, { type PanZoom } from 'panzoom';

	import DOMPurify from 'dompurify';
	import { copyToClipboard } from '$lib/utils';
	import { toast } from 'svelte-sonner';
	import Tooltip from './Tooltip.svelte';
	import Clipboard from '../icons/Clipboard.svelte';
	import Reset from '../icons/Reset.svelte';

	export let className = '';
	export let svg = '';
	export let content = '';

	let instance: PanZoom;

	let sceneParentElement: HTMLElement;
	let sceneElement: HTMLElement;

	$: if (sceneElement) {
		instance = panzoom(sceneElement, {
			bounds: true,
			boundsPadding: 0.1,

			zoomSpeed: 0.065
		});
	}
	function resetPanZoomViewport() {
		console.log('Reset View');
		instance.moveTo(0, 0);
		instance.zoomAbs(0, 0, 1);
		console.log(instance.getTransform());
	}
</script>

<div bind:this={sceneParentElement} class="relative {className}">
	<div bind:this={sceneElement} class="flex h-full max-h-full justify-center items-center">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized right here via DOMPurify.sanitize() with the svg/svgFilters profile -->
		{@html DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })}
	</div>

	{#if content}
		<div class=" absolute top-1 right-1">
			<Tooltip content={$i18n.t('Copy to clipboard')}>
				<button
					class="p-1.5 rounded-lg border border-gray-100 dark:border-none dark:bg-gray-850 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
					on:click={() => {
						copyToClipboard(content);
						toast.success($i18n.t('Copied to clipboard'));
					}}
				>
					<Clipboard className=" size-4" strokeWidth="1.5" />
				</button>
			</Tooltip>
		</div>
		<div class=" absolute top-1 right-10">
			<Tooltip content={$i18n.t('Reset view')}>
				<button
					class="p-1.5 rounded-lg border border-gray-100 dark:border-none dark:bg-gray-850 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
					on:click={() => {
						resetPanZoomViewport();
						toast.success($i18n.t('Reset view'));
					}}
				>
					<Reset className=" size-4" />
				</button>
			</Tooltip>
		</div>
	{/if}
</div>
