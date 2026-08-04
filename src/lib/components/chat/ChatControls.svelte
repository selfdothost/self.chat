<script lang="ts">
	import type { AnyFn } from '$lib/types';
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import { Pane, PaneResizer } from 'paneforge';

	import { onDestroy, onMount, tick } from 'svelte';
	import { showControls, showCallOverlay, showOverview, showArtifacts } from '$lib/stores';

	import Controls from './Controls/Controls.svelte';
	import CallOverlay from './MessageInput/CallOverlay.svelte';
	import Drawer from '../common/Drawer.svelte';
	import Overview from './Overview.svelte';
	import EllipsisVertical from '../icons/EllipsisVertical.svelte';
	import Artifacts from './Artifacts.svelte';





	interface Props {
		/* eslint-disable @typescript-eslint/no-explicit-any */
		history: any;
		models?: any;
		chatId?: any;
		chatFiles?: any;
		params?: any;
		eventTarget: EventTarget;
		submitPrompt: AnyFn;
		stopResponse: AnyFn;
		showMessage: AnyFn;
		files: any;
		modelId: any;
		pane?: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
	}

	// `models` accepted (part of the public props contract) but not read
	// internally by this component.
	let {
		history = $bindable(),
		chatId = null,
		chatFiles = $bindable([]),
		params = $bindable({}),
		eventTarget,
		submitPrompt,
		stopResponse,
		showMessage,
		files = $bindable(),
		modelId,
		pane = $bindable(null)
	}: Props = $props();

	let mediaQuery;
	let largeScreen = $state(false);
	let dragged = $state(false);

	let minSize = $state(0);

	export const openPane = () => {
		if (parseInt(localStorage?.chatControlsSize)) {
			pane.resize(parseInt(localStorage?.chatControlsSize));
		} else {
			pane.resize(minSize);
		}
	};

	const handleMediaQuery = async (e) => {
		if (e.matches) {
			largeScreen = true;

			if ($showCallOverlay) {
				showCallOverlay.set(false);
				await tick();
				showCallOverlay.set(true);
			}
		} else {
			largeScreen = false;

			if ($showCallOverlay) {
				showCallOverlay.set(false);
				await tick();
				showCallOverlay.set(true);
			}
			pane = null;
		}
	};

	const onMouseDown = (_event) => {
		dragged = true;
	};

	const onMouseUp = (_event) => {
		dragged = false;
	};

	onMount(() => {
		// listen to resize 1024px
		mediaQuery = window.matchMedia('(min-width: 1024px)');

		mediaQuery.addEventListener('change', handleMediaQuery);
		handleMediaQuery(mediaQuery);

		// Select the container element you want to observe
		const container = document.getElementById('chat-container');

		// initialize the minSize based on the container width
		minSize = Math.floor((350 / container.clientWidth) * 100);

		// Create a new ResizeObserver instance
		const resizeObserver = new ResizeObserver((entries) => {
			for (let entry of entries) {
				const width = entry.contentRect.width;
				// calculate the percentage of 200px
				const percentage = (350 / width) * 100;
				// set the minSize to the percentage, must be an integer
				minSize = Math.floor(percentage);

				if ($showControls) {
					if (pane && pane.isExpanded() && pane.getSize() < minSize) {
						pane.resize(minSize);
					}
				}
			}
		});

		// Start observing the container's size changes
		resizeObserver.observe(container);

		document.addEventListener('mousedown', onMouseDown);
		document.addEventListener('mouseup', onMouseUp);
	});

	onDestroy(() => {
		showControls.set(false);

		mediaQuery.removeEventListener('change', handleMediaQuery);
		document.removeEventListener('mousedown', onMouseDown);
		document.removeEventListener('mouseup', onMouseUp);
	});

	const closeHandler = () => {
		showControls.set(false);
		showOverview.set(false);
		showArtifacts.set(false);

		if ($showCallOverlay) {
			showCallOverlay.set(false);
		}
	};

	$effect(() => {
		if (!chatId) {
			closeHandler();
		}
	});
</script>

<SvelteFlowProvider>
	{#if !largeScreen}
		{#if $showControls}
			<Drawer
				show={$showControls}
				onClose={() => {
					showControls.set(false);
				}}
			>
				<div
					class=" {$showCallOverlay || $showOverview || $showArtifacts
						? ' h-screen  w-screen'
						: 'px-6 py-4'} h-full"
				>
					{#if $showCallOverlay}
						<div
							class=" h-full max-h-[100dvh] bg-white text-gray-700 dark:bg-black dark:text-gray-300 flex justify-center"
						>
							<CallOverlay
								bind:files
								{submitPrompt}
								{stopResponse}
								{modelId}
								{chatId}
								{eventTarget}
								onClose={() => {
									showControls.set(false);
								}}
							/>
						</div>
					{:else if $showArtifacts}
						<Artifacts {history} />
					{:else if $showOverview}
						<Overview
							{history}
							on:nodeclick={(e) => {
								showMessage(e.detail.node.data.message);
							}}
							on:close={() => {
								showControls.set(false);
							}}
						/>
					{:else}
						<Controls
							onClose={() => {
								showControls.set(false);
							}}
							bind:chatFiles
							bind:params
						/>
					{/if}
				</div>
			</Drawer>
		{/if}
	{:else}
		<!-- if $showControls -->

		{#if $showControls}
			<PaneResizer class="relative flex w-2 items-center justify-center bg-background group">
				<div class="z-10 flex h-7 w-5 items-center justify-center rounded-xs">
					<EllipsisVertical className="size-4 invisible group-hover:visible" />
				</div>
			</PaneResizer>
		{/if}

		<Pane
			bind:ref={pane}
			defaultSize={0}
			onResize={(size) => {
				if ($showControls && pane.isExpanded()) {
					if (size < minSize) {
						pane.resize(minSize);
					}

					if (size < minSize) {
						localStorage.chatControlsSize = 0;
					} else {
						localStorage.chatControlsSize = size;
					}
				}
			}}
			onCollapse={() => {
				showControls.set(false);
			}}
			collapsible={true}
			class="pt-8"
		>
			{#if $showControls}
				<div class="pr-4 pb-8 flex max-h-full min-h-full">
					<div
						class="w-full {($showOverview || $showArtifacts) && !$showCallOverlay
							? ' '
							: 'px-4 py-4 bg-white dark:shadow-lg dark:bg-gray-850  border border-gray-50 dark:border-gray-850'}  rounded-xl z-40 pointer-events-auto overflow-y-auto scrollbar-hidden"
					>
						{#if $showCallOverlay}
							<div class="w-full h-full flex justify-center">
								<CallOverlay
									bind:files
									{submitPrompt}
									{stopResponse}
									{modelId}
									{chatId}
									{eventTarget}
									onClose={() => {
										showControls.set(false);
									}}
								/>
							</div>
						{:else if $showArtifacts}
							<Artifacts {history} overlay={dragged} />
						{:else if $showOverview}
							<Overview
								{history}
								on:nodeclick={(e) => {
									if (e.detail.node.data.message.favorite) {
										history.messages[e.detail.node.data.message.id].favorite = true;
									} else {
										history.messages[e.detail.node.data.message.id].favorite = null;
									}

									showMessage(e.detail.node.data.message);
								}}
								on:close={() => {
									showControls.set(false);
								}}
							/>
						{:else}
							<Controls
								onClose={() => {
									showControls.set(false);
								}}
								bind:chatFiles
								bind:params
							/>
						{/if}
					</div>
				</div>
			{/if}
		</Pane>
	{/if}
</SvelteFlowProvider>
